#!/usr/bin/env bash
# Descargador DIAN — lanzador para macOS / Linux.
#   chmod +x iniciar_mac_linux.sh   (una vez)
#   ./iniciar_mac_linux.sh
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ERROR] No se encontró python3. Instala Python 3.10+ y vuelve a intentar."
  exit 1
fi

[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate

python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
python -m playwright install chromium

echo "Iniciando en http://127.0.0.1:5000 (Ctrl+C para detener)"
( sleep 2; command -v open >/dev/null && open http://127.0.0.1:5000 || \
  (command -v xdg-open >/dev/null && xdg-open http://127.0.0.1:5000) ) &
python app.py
