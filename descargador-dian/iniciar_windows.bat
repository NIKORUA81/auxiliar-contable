@echo off
chcp 65001 >nul
REM ============================================================
REM  Descargador DIAN - Lanzador para Windows
REM  Doble clic en este archivo para iniciar la aplicacion.
REM  Requiere Python 3.10+ instalado (https://www.python.org/downloads/,
REM  marca la casilla "Add python.exe to PATH" al instalar).
REM ============================================================
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] No se encontro Python.
  echo  Instala Python 3.10 o superior desde https://www.python.org/downloads/
  echo  y marca "Add python.exe to PATH" durante la instalacion.
  echo.
  pause
  exit /b 1
)

if not exist ".venv" (
  echo Creando entorno virtual (solo la primera vez)...
  python -m venv .venv
)
call ".venv\Scripts\activate.bat"

echo Instalando dependencias (solo la primera vez tarda unos minutos)...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
python -m playwright install chromium

echo.
echo  Iniciando el Descargador DIAN...
echo  Se abrira en tu navegador: http://127.0.0.1:5000
echo  Para cerrar la aplicacion, cierra esta ventana negra.
echo.
start "" http://127.0.0.1:5000
python app.py
pause
