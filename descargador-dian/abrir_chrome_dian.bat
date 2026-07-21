@echo off
cd /d "%~dp0"

echo ============================================================
echo   Paso 1 - Abrir Chrome para el Descargador DIAN
echo ============================================================
echo.
echo  Se abrira una ventana de Chrome DEDICADA (perfil aparte).
echo  1) Cuando cargue, ve al portal de la DIAN y resuelve el
echo     reto de Cloudflare (unos segundos).
echo  2) DEJA esa ventana de Chrome ABIERTA.
echo  3) Luego ejecuta "iniciar_windows.bat" (Paso 2).
echo.

set "PERFIL=%~dp0.chrome-dian"

REM Buscar chrome.exe en las rutas habituales
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined CHROME goto nochrome

echo  Abriendo Chrome...
start "" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%PERFIL%" "https://catalogo-vpfe.dian.gov.co/User/SearchDocument"
echo.
echo  Listo. Deja esa ventana abierta y ejecuta el Paso 2.
goto fin

:nochrome
echo  [ERROR] No se encontro Google Chrome en las rutas habituales.
echo  Instala Chrome desde https://www.google.com/chrome/ o edita este
echo  archivo (.bat) para apuntar a la ruta de tu chrome.exe.

:fin
echo.
pause
