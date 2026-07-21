@echo off
cd /d "%~dp0"

echo ============================================================
echo   Paso 1 - Abrir navegador para el Descargador DIAN
echo ============================================================
echo.
echo  IMPORTANTE: cierra primero TODAS las ventanas de Chrome
echo  (y de Edge) o el puerto de depuracion no se activara.
echo.
pause

set "PERFIL=%~dp0.chrome-dian"

REM --- Buscar Chrome; si no, Edge ---
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER goto nobrowser

echo.
echo  Navegador: %BROWSER%
echo  Abriendo con depuracion remota (puerto 9222)...
start "" "%BROWSER%" --remote-debugging-port=9222 --user-data-dir="%PERFIL%" "https://catalogo-vpfe.dian.gov.co/User/SearchDocument"

echo  Verificando el puerto 9222...
set "TRIES=0"
:waitloop
timeout /t 1 >nul
powershell -NoProfile -Command "try{ if((Invoke-WebRequest -Uri http://127.0.0.1:9222/json/version -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){exit 0}else{exit 1} }catch{ exit 1 }"
if %errorlevel%==0 goto success
set /a TRIES+=1
if %TRIES% LSS 12 goto waitloop

echo.
echo  [PROBLEMA] El navegador no expuso el puerto 9222.
echo  Causa mas comun: ya tenias Chrome (o Edge) abierto.
echo  Solucion: cierra TODAS las ventanas de ese navegador y
echo  vuelve a ejecutar este archivo.
goto fin

:success
echo.
echo  [OK] Puerto 9222 activo. El navegador esta listo.
echo.
echo  1) Resuelve el reto de Cloudflare en la ventana que se abrio.
echo  2) DEJA esa ventana abierta.
echo  3) Ejecuta "iniciar_windows.bat" (Paso 2).
goto fin

:nobrowser
echo  [ERROR] No se encontro Chrome ni Edge en las rutas habituales.
echo  Instala Google Chrome desde https://www.google.com/chrome/

:fin
echo.
pause
