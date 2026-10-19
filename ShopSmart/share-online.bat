@echo off
REM ShopSmart: put the ShopSmart running on THIS computer on a temporary public https address,
REM using a free Cloudflare quick tunnel (no account needed). Good for demos and testing on a phone.
REM The address works only while this computer, run-project.bat and this window stay on.
REM Start run-project.bat first and wait until the shop works at http://localhost:5173.

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared is not installed. Install it once with:
  echo     winget install --id Cloudflare.cloudflared
  echo Then close this window, open a NEW cmd window and run share-online.bat again.
  pause
  exit /b 1
)

cd /d "%~dp0frontend"
echo Building the website for sharing...
call npm run build
if errorlevel 1 (
  echo The website build failed. See the messages above.
  pause
  exit /b 1
)

start "12 public-site" cmd /k "npx vite preview --port 4173 --strictPort"
timeout /t 6 >nul

echo.
echo ======================================================================
echo  Your public address will appear below, in a box, ending in
echo  .trycloudflare.com   Open it on any phone or computer.
echo  Keep this window open. Close it (or run stop-project.bat) to go offline.
echo ======================================================================
echo.
title 13 public-tunnel
cloudflared tunnel --url http://localhost:4173
