@echo off
cd /d "%~dp0"
docker compose up --build -d --wait
if errorlevel 1 (
  pause
  exit /b 1
)
set "CEB_BROWSER_PORT="
for /f "tokens=2 delims=:" %%P in ('docker compose port app 3000') do set "CEB_BROWSER_PORT=%%P"
if not defined CEB_BROWSER_PORT (
  echo Could not find the CEB web address. Check Docker Desktop.
  pause
  exit /b 1
)
start "" "http://localhost:%CEB_BROWSER_PORT%"
