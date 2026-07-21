"""
Motor de descarga de documentos electrónicos de la DIAN por CUFE/CUDE.

Estrategia: cada documento del catálogo de la DIAN es accesible directamente
por su llave (la misma URL que codifica el QR de la factura), así no dependemos
de rellenar el formulario de búsqueda:

    https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=<CUFE>

El flujo por cada CUFE:
  1. Navegar a esa URL con un navegador real (Playwright).
  2. Esperar a que Cloudflare deje pasar y cargue la vista del documento.
  3. Hacer clic en "Descargar PDF" y guardar el archivo.

El navegador se abre VISIBLE (headed) por defecto para que, si Cloudflare
pide un clic, puedas resolverlo; en cuanto pasa, la descarga es automática.
No se resuelven captchas de forma automática.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl

# URL base del catálogo de la DIAN (vía QR, acceso directo por llave)
DIAN_QR_URL = "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey={cufe}"

# Botón "Buscar" del formulario de la DIAN: hay que pulsarlo (con el CUFE ya
# puesto por la URL) para que se muestre el documento y aparezca "Descargar PDF".
SEARCH_SELECTORS = [
    "button:has-text('Buscar')",
    "input[type=submit][value*='Buscar' i]",
    "input[type=button][value*='Buscar' i]",
    "button:has-text('Consultar')",
    "a:has-text('Buscar')",
]

# Texto del enlace/botón de descarga en la vista del documento
DOWNLOAD_SELECTORS = [
    "a:has-text('Descargar PDF')",
    "a:has-text('Descargar')",
    "button:has-text('Descargar PDF')",
    "text=Descargar PDF",
]


# ------------------------------ Lectura del Excel ------------------------------

def _norm(s: object) -> str:
    return (
        unicodedata.normalize("NFD", str(s or ""))
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
    )


def _sanitize_filename(name: str) -> str:
    name = re.sub(r"[^\w.\- ]+", "_", str(name)).strip().strip(".")
    return re.sub(r"\s+", " ", name)[:120] or "documento"


@dataclass
class RegistroCUFE:
    cufe: str
    tipo: str = ""
    prefijo: str = ""
    folio: str = ""

    def nombre_pdf(self) -> str:
        """Nombre sugerido del PDF: usa tipo/prefijo/folio si el Excel los trae."""
        if self.prefijo or self.folio:
            base = f"{self.tipo}_{self.prefijo}{self.folio}_{self.cufe[:12]}"
        elif self.tipo:
            base = f"{self.tipo}_{self.cufe[:16]}"
        else:
            base = self.cufe[:24]
        return _sanitize_filename(base) + ".pdf"


def leer_cufes(path: str | Path) -> list[RegistroCUFE]:
    """
    Lee las llaves CUFE/CUDE de un .xlsx. Autodetecta la columna de la llave
    y, si existen, las columnas Tipo de documento / Prefijo / Folio (formato
    del reporte de documentos electrónicos de la DIAN).
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)

    headers = next(rows, None)
    if not headers:
        return []
    norm_headers = [_norm(h) for h in headers]

    def find(*claves: str) -> int | None:
        for i, h in enumerate(norm_headers):
            if any(k in h for k in claves):
                return i
        return None

    idx_cufe = find("cufe", "cude", "documentkey", "llave")
    # Si no hay encabezado reconocible, asumimos que la llave está en la 1ª columna
    if idx_cufe is None:
        idx_cufe = 0
    idx_tipo = find("tipo de documento", "tipo")
    idx_prefijo = find("prefijo")
    idx_folio = find("folio")

    registros: list[RegistroCUFE] = []
    vistos: set[str] = set()

    def val(row: tuple, idx: int | None) -> str:
        if idx is None or idx >= len(row):
            return ""
        return str(row[idx]).strip() if row[idx] is not None else ""

    for row in rows:
        cufe = val(row, idx_cufe)
        # Una llave CUFE/CUDE es una cadena hex larga; ignora celdas vacías/basura
        if len(cufe) < 20 or not re.fullmatch(r"[0-9a-fA-F]+", cufe):
            continue
        if cufe in vistos:
            continue
        vistos.add(cufe)
        registros.append(
            RegistroCUFE(
                cufe=cufe,
                tipo=val(row, idx_tipo),
                prefijo=val(row, idx_prefijo),
                folio=val(row, idx_folio),
            )
        )
    return registros


# ------------------------------ Descarga ------------------------------

@dataclass
class ResultadoItem:
    cufe: str
    estado: str = "pendiente"  # pendiente | descargando | ok | error | no_encontrado
    archivo: str = ""
    mensaje: str = ""


@dataclass
class ProgresoJob:
    total: int = 0
    items: list[ResultadoItem] = field(default_factory=list)
    activo: bool = False
    terminado: bool = False
    error_global: str = ""

    def resumen(self) -> dict:
        ok = sum(1 for i in self.items if i.estado == "ok")
        err = sum(1 for i in self.items if i.estado in ("error", "no_encontrado"))
        return {
            "total": self.total,
            "ok": ok,
            "error": err,
            "activo": self.activo,
            "terminado": self.terminado,
            "error_global": self.error_global,
            "items": [i.__dict__ for i in self.items],
        }


# Script que se inyecta antes de cargar cada página para ocultar señales de
# automatización que Cloudflare usa para detectar bots.
STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
window.chrome = window.chrome || { runtime: {} };
Object.defineProperty(navigator, 'languages', {get: () => ['es-CO', 'es']});
Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
"""

# Primer CUFE: se da más tiempo para que el usuario resuelva Cloudflare a mano.
PRIMER_TIMEOUT_MS = 180000

# Puerto por defecto de depuración remota del Chrome que abre el usuario.
CDP_URL_DEFAULT = "http://127.0.0.1:9222"


def _esperar_alguno(page, selectores: list[str], timeout_ms: int):
    """Espera hasta que aparezca (visible) alguno de los selectores. Devuelve
    (selector, elemento) o (None, None) si se agota el tiempo. Sondeo por
    polling para tolerar la pantalla de Cloudflare mientras carga."""
    import time

    fin = time.time() + timeout_ms / 1000
    while time.time() < fin:
        for sel in selectores:
            try:
                el = page.query_selector(sel)
                if el and el.is_visible():
                    return sel, el
            except Exception:  # noqa: BLE001 — elemento aún no estable
                pass
        page.wait_for_timeout(500)
    return None, None


def _descargar_uno(page, reg, item, espera: int, timeout_ms: int, base_url: str, destino: Path) -> bool:
    """Procesa un CUFE: abre la página, pulsa 'Buscar' si aparece, y descarga el
    PDF. Devuelve True si quedó descargado."""
    page.goto(base_url.format(cufe=reg.cufe), wait_until="domcontentloaded")

    # Espera a que pase Cloudflare y aparezca "Buscar" o directamente "Descargar".
    sel, el = _esperar_alguno(page, SEARCH_SELECTORS + DOWNLOAD_SELECTORS, espera)

    if sel in SEARCH_SELECTORS:
        # Pulsar "Buscar" y esperar a que se muestre el documento con "Descargar".
        el.click()
        sel, el = _esperar_alguno(page, DOWNLOAD_SELECTORS, timeout_ms)

    if not el:
        item.estado = "no_encontrado"
        item.mensaje = (
            "No apareció el botón 'Descargar PDF' (documento inexistente, "
            "Cloudflare sin resolver o cambió la página de la DIAN)."
        )
        return False

    with page.expect_download(timeout=timeout_ms) as dl_info:
        el.click()
    download = dl_info.value
    ruta = destino / reg.nombre_pdf()
    download.save_as(str(ruta))
    item.estado = "ok"
    item.mensaje = ""
    item.archivo = ruta.name
    return True


def _procesar_lote(
    page,
    registros: list[RegistroCUFE],
    progreso: ProgresoJob,
    destino: Path,
    base_url: str,
    timeout_ms: int,
    reintentos: int = 1,
) -> None:
    """Recorre los CUFEs, pulsando 'Buscar' y descargando cada PDF. Al final
    reintenta automáticamente los que fallaron (Cloudflare ya está resuelto)."""
    from playwright.sync_api import TimeoutError as PWTimeout

    primero = True
    for item, reg in zip(progreso.items, registros):
        item.estado = "descargando"
        if primero:
            item.mensaje = "Resuelve el reto de Cloudflare en la ventana del navegador si aparece…"
        espera = PRIMER_TIMEOUT_MS if primero else timeout_ms
        try:
            if _descargar_uno(page, reg, item, espera, timeout_ms, base_url, destino):
                primero = False
        except PWTimeout:
            item.estado = "error"
            item.mensaje = "Tiempo de espera agotado."
        except Exception as e:  # noqa: BLE001 — reportar sin tumbar el lote
            item.estado = "error"
            item.mensaje = str(e)[:300]

    # Reintentos automáticos de los fallidos (ya pasado Cloudflare).
    for _ in range(max(0, reintentos)):
        pendientes = [
            (item, reg)
            for item, reg in zip(progreso.items, registros)
            if item.estado in ("error", "no_encontrado")
        ]
        if not pendientes:
            break
        for item, reg in pendientes:
            item.estado = "descargando"
            item.mensaje = "Reintentando…"
            try:
                if not _descargar_uno(page, reg, item, timeout_ms, timeout_ms, base_url, destino):
                    pass
            except PWTimeout:
                item.estado = "error"
                item.mensaje = "Tiempo de espera agotado (reintento)."
            except Exception as e:  # noqa: BLE001
                item.estado = "error"
                item.mensaje = str(e)[:300]


def descargar_documentos(
    registros: list[RegistroCUFE],
    carpeta_destino: str | Path,
    progreso: ProgresoJob,
    headless: bool = False,
    timeout_ms: int = 60000,
    base_url: str = DIAN_QR_URL,
    executable_path: str | None = None,
    perfil_dir: str | Path | None = None,
    channel: str | None = "chrome",
    cdp_url: str | None = None,
) -> None:
    """
    Procesa la lista de CUFEs de forma secuencial y actualiza `progreso`.

    Dos formas de obtener el navegador, en orden de preferencia:

    1. **Conectar a tu Chrome ya abierto** (`cdp_url`): si abriste Chrome con
       depuración remota (ver abrir_chrome_dian.bat) y resolviste Cloudflare ahí,
       el programa abre las pestañas EN ESE MISMO navegador y hereda tu sesión
       aprobada. Es lo más confiable contra Cloudflare. No cierra tu navegador.
    2. **Perfil persistente propio** (respaldo): abre un Chrome con un perfil
       guardado en `.perfil_chrome/`; resuelves Cloudflare la primera vez y la
       cookie queda para las siguientes.

    Se importa Playwright aquí adentro para que la app arranque aunque los
    navegadores aún no estén instalados (`playwright install chromium`).
    """
    from playwright.sync_api import sync_playwright

    destino = Path(carpeta_destino)
    destino.mkdir(parents=True, exist_ok=True)

    progreso.activo = True
    try:
        with sync_playwright() as p:
            # --- Vía 1: conectar al Chrome que el usuario ya abrió (CDP) ---
            if cdp_url:
                try:
                    browser = p.chromium.connect_over_cdp(cdp_url)
                    context = browser.contexts[0] if browser.contexts else browser.new_context()
                    page = context.new_page()
                    _procesar_lote(page, registros, progreso, destino, base_url, timeout_ms)
                    page.close()  # cerramos solo nuestra pestaña, no el navegador del usuario
                    return
                except Exception as e:  # noqa: BLE001 — si no hay Chrome en 9222, respaldo
                    progreso.error_global = (
                        f"No se pudo conectar a tu Chrome ({cdp_url}). "
                        f"Abre primero 'abrir_chrome_dian.bat'. Detalle: {str(e)[:150]}"
                    )
                    return

            # --- Vía 2 (respaldo): perfil persistente propio ---
            perfil = Path(perfil_dir) if perfil_dir else (Path(__file__).resolve().parent / ".perfil_chrome")
            perfil.mkdir(parents=True, exist_ok=True)
            launch_kwargs: dict = {
                "user_data_dir": str(perfil),
                "headless": headless,
                "accept_downloads": True,
                "no_viewport": True,
                "args": ["--disable-blink-features=AutomationControlled", "--start-maximized"],
            }
            if executable_path:
                launch_kwargs["executable_path"] = executable_path
            try:
                context = p.chromium.launch_persistent_context(channel=channel, **launch_kwargs)
            except Exception:
                context = p.chromium.launch_persistent_context(**launch_kwargs)

            context.add_init_script(STEALTH_JS)
            page = context.pages[0] if context.pages else context.new_page()
            _procesar_lote(page, registros, progreso, destino, base_url, timeout_ms)
            context.close()
    except Exception as e:  # noqa: BLE001
        progreso.error_global = str(e)[:300]
    finally:
        progreso.activo = False
        progreso.terminado = True
