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


def descargar_documentos(
    registros: list[RegistroCUFE],
    carpeta_destino: str | Path,
    progreso: ProgresoJob,
    headless: bool = False,
    timeout_ms: int = 60000,
    base_url: str = DIAN_QR_URL,
    executable_path: str | None = None,
) -> None:
    """
    Procesa la lista de CUFEs de forma secuencial con un solo navegador.
    Actualiza `progreso` en el sitio para que la interfaz muestre el avance.

    Se importa Playwright aquí adentro para que la app arranque aunque los
    navegadores aún no estén instalados (`playwright install chromium`).
    """
    from playwright.sync_api import TimeoutError as PWTimeout
    from playwright.sync_api import sync_playwright

    destino = Path(carpeta_destino)
    destino.mkdir(parents=True, exist_ok=True)

    progreso.activo = True
    try:
        with sync_playwright() as p:
            launch_kwargs: dict = {"headless": headless}
            if executable_path:
                launch_kwargs["executable_path"] = executable_path
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()

            for item, reg in zip(progreso.items, registros):
                item.estado = "descargando"
                try:
                    page.goto(base_url.format(cufe=reg.cufe), wait_until="domcontentloaded")

                    # Espera a que Cloudflare pase y aparezca el botón de descarga.
                    enlace = None
                    for sel in DOWNLOAD_SELECTORS:
                        try:
                            enlace = page.wait_for_selector(sel, timeout=timeout_ms, state="visible")
                            if enlace:
                                break
                        except PWTimeout:
                            continue

                    if not enlace:
                        item.estado = "no_encontrado"
                        item.mensaje = (
                            "No apareció el botón 'Descargar PDF' (documento inexistente, "
                            "Cloudflare sin resolver o cambió la página de la DIAN)."
                        )
                        continue

                    with page.expect_download(timeout=timeout_ms) as dl_info:
                        enlace.click()
                    download = dl_info.value
                    ruta = destino / reg.nombre_pdf()
                    download.save_as(str(ruta))
                    item.estado = "ok"
                    item.archivo = ruta.name
                except PWTimeout:
                    item.estado = "error"
                    item.mensaje = "Tiempo de espera agotado."
                except Exception as e:  # noqa: BLE001 — reportar sin tumbar el lote
                    item.estado = "error"
                    item.mensaje = str(e)[:300]

            context.close()
            browser.close()
    except Exception as e:  # noqa: BLE001
        progreso.error_global = str(e)[:300]
    finally:
        progreso.activo = False
        progreso.terminado = True
