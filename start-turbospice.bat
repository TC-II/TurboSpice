@echo off
setlocal EnableDelayedExpansion
title TurboSpice

rem Starts the local dev server and opens the app in the browser.
rem Keep this window open while using the app; closing it stops the server.

rem Work from the folder this file sits in, not the invoking directory.
cd /d "%~dp0"
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

rem Which branch to serve. main runs in this folder; dev runs in its own
rem detached worktree (.claude\worktrees\dev-local), so this checkout keeps its branch.
set "BRANCH=main"
set "PORT=5173"
set "DIR=%ROOT%"

rem Put the real Node.js install first on PATH; `where node` can resolve to
rem an unrelated shim.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   npm was not found.
  echo.
  echo   Install Node.js LTS from https://nodejs.org, then close this
  echo   window and run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   TurboSpice
echo.
echo     1. main - the stable branch   http://localhost:5173/TurboSpice/
echo     2. dev  - the dev branch      http://localhost:5182/TurboSpice/
echo.
choice /c 12 /n /m "  Choose 1 or 2: "
if errorlevel 2 (
  set "BRANCH=dev"
  set "PORT=5182"
  set "DIR=%ROOT%\.claude\worktrees\dev-local"
)
set "URL=http://localhost:%PORT%/TurboSpice/"
title TurboSpice - %BRANCH%

rem If the port already answers, open the browser instead of starting a second
rem server. PowerShell does a real TCP connect; `netstat | findstr` is unreliable.
set "RUNNING="
for /f "delims=" %%R in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %PORT%); $c.Close(); 'yes' } catch { 'no' }" 2^>nul') do set "RUNNING=%%R"

if /i "%RUNNING%"=="yes" (
  echo.
  echo   The server is already running on port %PORT%.
  echo   Opening %URL%
  start "" "%URL%"
  timeout /t 3 /nobreak >nul
  exit /b 0
)

if /i "%BRANCH%"=="dev" (
  call :prepare_dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

cd /d "%DIR%"

rem Install dependencies on first run only.
if not exist "node_modules\vite\package.json" (
  echo.
  echo   Installing dependencies - first run only...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. The error is above.
    echo.
    pause
    exit /b 1
  )
)

rem The ngspice WASM engine is not in the repo. If missing, download the build
rem published on GitHub Pages (compiled by CI). See docs/setup-windows.md.
if not exist "engine\dist-engine\ngspice.wasm" (
  echo.
  echo   Engine not found - downloading it from the published site...
  echo.
  call npm run engine:fetch
  if errorlevel 1 (
    echo.
    echo   Could not download the engine. See docs\setup-windows.md.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo   Starting the %BRANCH% dev server on %URL%
echo.

rem Open the browser once Vite is listening, in the background.
start "" cmd /c "timeout /t 4 /nobreak >nul & start "" "%URL%""

rem Run Vite in the foreground. `npm run dev` also copies the engine and
rem builds the component library first.
npm run dev -- --port %PORT% --strictPort
exit /b 0

rem Puts the dev worktree on origin/dev: creates it the first time, then moves it.
:prepare_dev
where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo   git was not found. Install Git for Windows, then run this file again.
  echo.
  exit /b 1
)

echo.
echo   Fetching dev from origin...
git -C "%ROOT%" fetch origin dev
if errorlevel 1 echo   Could not fetch origin dev: using the last version fetched.

if not exist "%DIR%\package.json" (
  git -C "%ROOT%" worktree add --detach "%DIR%" origin/dev
  if errorlevel 1 (
    echo.
    echo   Could not create the dev folder. The error is above.
    echo.
    exit /b 1
  )
) else (
  git -C "%DIR%" checkout --detach origin/dev
  if errorlevel 1 (
    echo.
    echo   The dev folder has changes that block the update. The error is above.
    echo.
    exit /b 1
  )
)
exit /b 0
