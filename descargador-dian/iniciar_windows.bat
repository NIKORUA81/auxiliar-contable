@echo off
cd /d "%~dp0"

echo ============================================================
echo   Descargador DIAN
echo ============================================================
echo.

py -3 --version >nul 2>nul
if %errorlevel%==0 goto haspy
python --version >nul 2>nul
if %errorlevel%==0 goto haspython

echo  [ERROR] No se encontro Python 3.
echo  Instala Python 3.10 o superior desde:
echo      https://www.python.org/downloads/
echo  y marca "Add python.exe to PATH". Luego ejecuta de nuevo este archivo.
goto fin

:haspy
set "PY=py -3"
goto ready

:haspython
set "PY=python"
goto ready

:ready
echo  Python detectado:
%PY% --version
echo.

if exist ".venv\Scripts\activate.bat" goto venvok
echo  Creando entorno virtual (solo la primera vez)...
%PY% -m venv .venv
if not exist ".venv\Scripts\activate.bat" goto venverror

:venvok
call ".venv\Scripts\activate.bat"

echo  Instalando dependencias (la primera vez tarda unos minutos)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 goto piperror

echo  Descargando el navegador Chromium...
python -m playwright install chromium
if errorlevel 1 goto pwerror

echo.
echo  Todo listo. Iniciando el servidor...
echo  Se abrira en tu navegador: http://127.0.0.1:5000
echo  Para DETENER la aplicacion, cierra esta ventana.
echo.
start "" http://127.0.0.1:5000
python app.py
goto fin

:venverror
echo  [ERROR] No se pudo crear el entorno virtual .venv
goto fin

:piperror
echo  [ERROR] Fallo la instalacion de dependencias. Revisa tu conexion a internet.
goto fin

:pwerror
echo  [ERROR] Fallo la descarga del navegador Chromium.
goto fin

:fin
echo.
echo  (Esta ventana no se cerrara sola. Puedes leer el mensaje de arriba.)
pause
