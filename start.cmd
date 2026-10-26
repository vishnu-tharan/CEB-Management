@echo off

rem Run the server from this project's directory.
cd /d "%~dp0"
node backend\server.js

rem Keep the window open when startup fails so the error can be read.
if errorlevel 1 (
  pause
)
