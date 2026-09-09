@echo off
cd /d "%~dp0"
node backend\server.js
if errorlevel 1 pause
