@echo off
setlocal
title Duolingo FM - Local Server
cd /d "%~dp0"

echo.
echo  [1/3] Stopping any servers already running (ports 3000, 8484)...
powershell -NoProfile -Command "foreach ($p in 3000,8484) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }" >nul 2>&1

echo  [2/3] Allowing Node through Windows Firewall (one-time, needs ADMIN first run)...
powershell -NoProfile -Command "if (-not (Get-NetFirewallRule -DisplayName 'DuolingoFM Local Server' -ErrorAction SilentlyContinue)) { $n = (Get-Command node).Source; New-NetFirewallRule -DisplayName 'DuolingoFM Local Server' -Direction Inbound -Action Allow -Program $n -Protocol TCP -LocalPort 8484 -Profile Any | Out-Null; Write-Output 'rule-created' } else { Write-Output 'rule-exists' }"
echo.
net session >nul 2>&1
if errorlevel 1 (
    echo  ^!^! NOTE: Firewall rule NOT created - this window is not elevated.
    echo     Right-click run.bat and "Run as administrator" ONCE, then run it normally.
    echo     Phone access will not work until the rule exists.
    echo.
)

echo  [3/3] Starting Duolingo FM static server...
echo.
echo  ==========================================================
echo    On this PC:      http://localhost:8484/
echo    On your phone    http://192.168.0.102:8484/
echo    (same Wi-Fi network required)
echo    Stop: close this window (or press Ctrl+C)
echo  ==========================================================
echo.

node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};http.createServer((req,res)=>{let u=req.url.split('?')[0];try{u=decodeURIComponent(u)}catch(e){}if(u==='/')u='/index.html';const fp=path.join(root,u);if(!fp.startsWith(root)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);}).listen(8484,'0.0.0.0',()=>console.log('Serving on LAN: http://192.168.0.102:8484/'));"

echo.
echo  Server stopped.
pause
endlocal
