@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Descargador DIAN
echo ============================================================
echo.

REM --- Detectar Python de forma robusta (evita el stub de Microsoft Store) ---
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo  [ERROR] No se encontro Python en este equipo.
  echo.
  echo  Instala Python 3.10 o superior desde:
  echo      https://www.python.org/downloads/
  echo  y MUY IMPORTANTE: marca la casilla "Add python.exe to PATH"
  echo  al inicio del instalador. Luego vuelve a ejecutar este archivo.
  echo.
  goto :fin
)

echo  Python detectado:
%PY% --version
echo.

REM --- Crear entorno virtual la primera vez ---
if not exist ".venv\Scripts\activate.bat" (
  echo  Creando entorno virtual (solo la primera vez)...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo  [ERROR] No se pudo crear el entorno virtual.
    goto :fin
  )
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 (
  echo  [ERROR] No se pudo activar el entorno virtual.
  goto :fin
)

REM --- Instalar dependencias ---
echo  Instalando dependencias (la primera vez tarda unos minutos)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo  [ERROR] Fallo la instalacion de dependencias (revisa tu conexion a internet).
  goto :fin
)

echo  Descargando el navegador para la automatizacion...
python -m playwright install chromium
if errorlevel 1 (
  echo  [ERROR] Fallo la descarga del navegador Chromium.
  goto :fin
)

echo.
echo  Todo listo. Iniciando el servidor...
echo  Se abrira en tu navegador: http://127.0.0.1:5000
echo  Para DETENER la aplicacion, cierra esta ventana.
echo.
start "" http://127.0.0.1:5000
python app.py

:fin
echo.
echo  (Esta ventana no se cerrara sola: puedes leer el mensaje de arriba.)
pause
