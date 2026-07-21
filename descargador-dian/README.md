# Descargador DIAN — documentos electrónicos por CUFE

Módulo local que descarga en lote los **PDF de documentos electrónicos de la DIAN** a partir
de una lista de llaves **CUFE/CUDE** en un archivo `.xlsx`. Interfaz web local (Flask) +
motor de automatización con navegador real (Playwright).

Complementa al resto del proyecto: puedes alimentarlo con **el mismo reporte de documentos
electrónicos de la DIAN** que ya usa el auxiliar contable (detecta la columna `CUFE/CUDE` y,
si están, `Tipo de documento` / `Prefijo` / `Folio` para nombrar cada PDF).

## Cómo funciona

Cada documento del catálogo de la DIAN es accesible **directamente por su llave**, con la
misma URL que codifica el QR de la factura:

```
https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=<CUFE>
```

Por cada CUFE de la lista, el programa:

1. Abre esa URL en un navegador real (Playwright).
2. Espera a que **Cloudflare** deje pasar.
3. Si la página muestra un botón **«Buscar»**, lo pulsa automáticamente para desplegar el
   documento.
4. Hace clic en **«Descargar PDF»** y guarda el archivo en `descargas/`.
5. Al terminar el lote, **reintenta solo** los CUFEs que hayan fallado (para entonces
   Cloudflare ya está resuelto, así que normalmente salen en el reintento).

### Cómo se pasa Cloudflare (importante)

Cloudflare bloquea los navegadores "automatizados de fábrica". Por eso el modo recomendado es
**conectarse a un Chrome que tú abres** (`abrir_chrome_dian.bat`), donde tú resuelves el reto:

- Ese `.bat` lanza Chrome con **depuración remota** (`--remote-debugging-port=9222`) y un
  **perfil dedicado** (`.chrome-dian/`, separado de tu Chrome normal).
- Resuelves Cloudflare ahí una vez; la cookie de aprobación (`cf_clearance`) queda en ese
  perfil, así que en próximas corridas normalmente ya no lo pide.
- La app se conecta por CDP (`connect_over_cdp`) y abre las pestañas de descarga **en ese
  mismo navegador**, heredando tu sesión aprobada. No cierra tu navegador.

Configuración por entorno (`PLAYWRIGHT_CDP`): por defecto `http://127.0.0.1:9222`. Si lo
dejas **vacío**, la app usa un modo de respaldo (perfil propio persistente en `.perfil_chrome/`
con `channel="chrome"` y ocultando señales de automatización), menos efectivo contra
Cloudflare pero sin depender del paso 1.

## Inicio rápido (Windows) — flujo de 2 pasos

Requiere **Python 3.10+** (marca *«Add python.exe to PATH»* al instalar) y **Google Chrome**.

1. **Doble clic en `abrir_chrome_dian.bat`** — abre un Chrome dedicado en el portal de la DIAN.
   Resuelve ahí el reto de **Cloudflare** una vez y **deja esa ventana abierta**.
2. **Doble clic en `iniciar_windows.bat`** — arranca la app y abre `http://127.0.0.1:5000`.
   La app se conecta a ese Chrome (que ya pasó Cloudflare) y descarga los documentos **en
   pestañas de ese mismo navegador**.

¿Por qué dos pasos? Cloudflare bloquea los navegadores automatizados "de fábrica". Al usar el
Chrome que **tú** abriste y donde **tú** pasaste el reto, el programa hereda esa sesión
aprobada — es la forma más confiable. Ver «Cómo se pasa Cloudflare» más abajo.

En **macOS / Linux**: `./iniciar_mac_linux.sh`. Para el Chrome con depuración, ábrelo con
`google-chrome --remote-debugging-port=9222 --user-data-dir=./.chrome-dian` (o el binario de
tu sistema) antes de iniciar la app.

## Instalación manual (alternativa)

```bash
cd descargador-dian
python -m venv .venv && source .venv/bin/activate   # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium                          # descarga el navegador, una sola vez
python app.py
# abre http://127.0.0.1:5000 en tu navegador
```

1. Sube el `.xlsx` con las llaves CUFE (o el reporte de la DIAN completo).
2. Opcional: indica una subcarpeta de destino (ej. `empresa-x_junio-2026`).
3. «Iniciar descarga». Se abre una ventana de navegador controlada; resuelve el reto de
   Cloudflare si aparece. El progreso se ve en la tabla, fila por fila.
4. Los PDF quedan en `descargas/` (o en la subcarpeta indicada).

Hay un archivo de ejemplo en `samples/cufes_ejemplo.xlsx` (llaves ficticias, solo para ver
el formato; no descargarán nada real).

## Formato del Excel

- **Obligatorio**: una columna con las llaves. Se detecta por encabezado que contenga
  `CUFE`, `CUDE`, `documentkey` o `llave`; si no hay encabezado reconocible, se toma la
  primera columna. Se ignoran celdas que no parezcan una llave (cadena hexadecimal larga)
  y se eliminan duplicados.
- **Opcional** (mejoran el nombre del PDF): `Tipo de documento`, `Prefijo`, `Folio`.

Nombre del PDF resultante:
`Tipo_PrefijoFolio_CUFEcorto.pdf` si hay tipo/prefijo/folio; si no, la llave CUFE.

## Notas y límites

- **Depende de Cloudflare y de la estructura de la página de la DIAN.** Si la DIAN cambia el
  portal o el texto del botón, ajusta `DOWNLOAD_SELECTORS` / `DIAN_QR_URL` en
  `descargador.py`. Es automatización de un sitio de terceros: por diseño es frágil.
- Uso legítimo: descargar **tus propios** documentos, con CUFEs que ya posees. Procesa las
  llaves de forma **secuencial** (no en paralelo) para no saturar el portal.
- Herramienta de **un usuario en tu equipo**: el estado se guarda en memoria y se procesa un
  lote a la vez.

## Variables de entorno

- `HEADLESS=1` — corre el navegador sin ventana (solo para pruebas automatizadas; en uso real
  déjalo visible para poder resolver Cloudflare).
- `PLAYWRIGHT_CHROMIUM=/ruta/al/chrome` — usa un Chromium ya instalado en lugar del que baja
  `playwright install`.

## Proyección a la web (siguiente paso)

Este módulo se diseñó para migrar después al VPS: el motor (`descargador.py`) es
independiente de la interfaz. En un servidor **sin pantalla**, Cloudflare no se puede
resolver a mano, así que la versión web requerirá una estrategia distinta (navegador
persistente con sesión ya validada, o ejecución asistida). Se abordará cuando el flujo local
esté probado con documentos reales.
