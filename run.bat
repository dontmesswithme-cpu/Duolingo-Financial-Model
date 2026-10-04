@echo off
setlocal
title Duolingo FM - Local Server
cd /d "%~dp0"

echo.
echo  ==========================================================
echo    Duolingo FM - Local Development Server
echo    On this PC:      http://localhost:8484/
echo    LAN Mode:        Pass --lan to enable network access
echo    Stop:            close this window (or press Ctrl+C)
echo  ==========================================================
echo.

node tools\local_server.mjs %*

if errorlevel 1 (
    echo.
    echo  Server stopped with exit code %errorlevel%.
)
pause
endlocal
