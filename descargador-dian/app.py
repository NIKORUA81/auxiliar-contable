"""
Descargador DIAN — interfaz local (Flask) + motor Playwright.

Uso local:
    cd descargador-dian
    pip install -r requirements.txt
    playwright install chromium      # una sola vez
    python app.py
    # abre http://127.0.0.1:5000

Herramienta de un solo usuario en tu equipo: el estado se guarda en memoria
y se procesa un lote a la vez.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory

from descargador import (
    DIAN_QR_URL,
    ProgresoJob,
    ResultadoItem,
    descargar_documentos,
    leer_cufes,
)

BASE_DIR = Path(__file__).resolve().parent
CARPETA_DESCARGAS = BASE_DIR / "descargas"
CARPETA_SUBIDAS = BASE_DIR / "_subidas"
CARPETA_DESCARGAS.mkdir(exist_ok=True)
CARPETA_SUBIDAS.mkdir(exist_ok=True)

# Navegador visible por defecto para poder resolver Cloudflare si lo pide.
# Exporta HEADLESS=1 solo para pruebas automatizadas sin pantalla.
HEADLESS = os.environ.get("HEADLESS", "0") == "1"
# Permite apuntar a un Chromium ya instalado (p. ej. en este entorno de pruebas).
EXECUTABLE_PATH = os.environ.get("PLAYWRIGHT_CHROMIUM") or None
# Canal del navegador: "chrome" (tu Chrome real, mejor contra Cloudflare),
# "msedge", o "" para usar el Chromium que trae Playwright.
CHANNEL = os.environ.get("PLAYWRIGHT_CHANNEL", "chrome") or None
# URL para acceder a cada documento por su llave (configurable por si la DIAN cambia).
DIAN_URL = os.environ.get("DIAN_URL") or DIAN_QR_URL

app = Flask(__name__)

# Estado global de un único job (herramienta local, un usuario).
_job: ProgresoJob | None = None
_lock = threading.Lock()


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/iniciar")
def iniciar():
    global _job
    with _lock:
        if _job is not None and _job.activo:
            return jsonify({"error": "Ya hay una descarga en curso."}), 409

    archivo = request.files.get("archivo")
    if not archivo or not archivo.filename:
        return jsonify({"error": "Adjunte el archivo .xlsx con las llaves CUFE."}), 400
    if not archivo.filename.lower().endswith((".xlsx", ".xls")):
        return jsonify({"error": "El archivo debe ser .xlsx o .xls."}), 400

    ruta_subida = CARPETA_SUBIDAS / "entrada.xlsx"
    archivo.save(ruta_subida)

    try:
        registros = leer_cufes(ruta_subida)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": f"No fue posible leer el Excel: {e}"}), 400

    if not registros:
        return jsonify(
            {"error": "No se encontraron llaves CUFE/CUDE válidas en el archivo."}
        ), 400

    # Subcarpeta de destino opcional (para separar lotes por empresa/fecha)
    subcarpeta = (request.form.get("carpeta") or "").strip()
    destino = CARPETA_DESCARGAS / subcarpeta if subcarpeta else CARPETA_DESCARGAS

    job = ProgresoJob(total=len(registros))
    job.items = [ResultadoItem(cufe=r.cufe) for r in registros]

    def worker():
        descargar_documentos(
            registros,
            destino,
            job,
            headless=HEADLESS,
            executable_path=EXECUTABLE_PATH,
            channel=CHANNEL,
            base_url=DIAN_URL,
        )

    with _lock:
        _job = job
    threading.Thread(target=worker, daemon=True).start()

    return jsonify({"ok": True, "total": len(registros)})


@app.get("/estado")
def estado():
    with _lock:
        if _job is None:
            return jsonify({"total": 0, "items": [], "activo": False, "terminado": False})
        return jsonify(_job.resumen())


@app.get("/descargas/<path:nombre>")
def descarga(nombre: str):
    return send_from_directory(CARPETA_DESCARGAS, nombre, as_attachment=True)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
