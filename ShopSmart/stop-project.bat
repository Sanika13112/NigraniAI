@echo off
REM ShopSmart: stop the whole project (all backend services + frontend).
echo Stopping ShopSmart...

REM Close the service windows opened by start-backend.bat / run-project.bat
for %%t in ("1 discovery-server*" "2 customer-service*" "3 product-service*" "4 authentication-service*" "5 notification-service*" "6 order-service*" "7 payment-service*" "8 analytics-service*" "9 api-gateway*" "10 frontend*" "11 log-shipper*" "12 public-site*" "13 public-tunnel*") do (
  taskkill /F /T /FI "WINDOWTITLE eq %%~t" >nul 2>&1
)

taskkill /F /IM cloudflared.exe >nul 2>&1

REM Stop anything still listening on ShopSmart ports
for %%p in (8761 8080 8081 8082 8083 8084 8085 8086 8087 5173 4173) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr LISTENING ^| findstr /r /c:":%%p "') do taskkill /F /T /PID %%a >nul 2>&1
)

timeout /t 2 >nul
netstat -ano | findstr LISTENING | findstr /r /c:":8761 " /c:":808[0-7] " /c:":5173 " >nul
if errorlevel 1 (
  echo All ShopSmart services are stopped.
) else (
  echo Some ports are still in use. Run stop-project.bat again.
)
if not "%1"=="quiet" pause
