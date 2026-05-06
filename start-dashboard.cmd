@echo off
cd /d "%~dp0"
echo Starting AIP Investment Dashboard...
echo.
echo Keep this window open while you use the dashboard.
echo If the browser opens before the server is ready, refresh the page.
echo.
start "" "http://127.0.0.1:4173/"
node server.js
pause
