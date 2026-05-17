@echo off
REM IONITY GUI installer launcher (Windows, double-clickable).
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is required but was not found in PATH.
    echo Install Node.js 18 or newer from https://nodejs.org/ and re-run this file.
    pause
    exit /b 1
)

node installer.js
pause
endlocal
