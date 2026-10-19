@echo off
REM ============================================================
REM  ShopSmart - start all backend services on Windows (cmd)
REM  Put this file in the ShopSmart folder (next to "backend").
REM  1) Edit DB_PASSWORD below   2) Double-click this file
REM ============================================================

set JWT_SECRET=my-local-dev-jwt-secret-at-least-32-characters-long
set INTERNAL_API_KEY=local-internal-key-1234567890
set DB_USERNAME=root
set DB_PASSWORD=Sanika@123
set DB_URL=jdbc:mysql://localhost:33006/shopsmart_db?createDatabaseIfNotExist=true
set COOKIE_SECURE=false
set ADMIN_EMAIL=admin@shopsmart.local
set ADMIN_PASSWORD=AdminPass12345

REM Optional: Razorpay sandbox keys (leave empty = Cash on Delivery only)
set RAZORPAY_KEY_ID=rzp_test_TniqLpWmnlbEEw
set RAZORPAY_KEY_SECRET=kRpqCG4si4dEBufIEJyjXMjP
set RAZORPAY_WEBHOOK_SECRET=


if not exist "%~dp0backend" (
  echo Could not find the "backend" folder next to this file.
  echo Move start-backend.bat into the ShopSmart folder that contains "backend" and "frontend".
  pause
  exit /b 1
)

if exist "%~dp0shopsmart.env.bat" call "%~dp0shopsmart.env.bat"

cd /d "%~dp0backend"

echo Starting discovery server...
start "1 discovery-server :8761" cmd /k "cd discoveryserver && mvnw.cmd spring-boot:run"
echo Waiting 30 seconds for Eureka...
timeout /t 30 /nobreak >nul

start "2 customer-service :8081"       cmd /k "cd customerservice && mvnw.cmd spring-boot:run"
start "3 product-service :8082"        cmd /k "cd productservice && mvnw.cmd spring-boot:run"
start "4 authentication-service :8083" cmd /k "cd authenticationservice && mvnw.cmd spring-boot:run"
start "5 notification-service :8086"   cmd /k "cd notificationservice && mvnw.cmd spring-boot:run"
start "6 order-service :8084"          cmd /k "cd orderservice && mvnw.cmd spring-boot:run"
start "7 payment-service :8085"        cmd /k "cd paymentservice && mvnw.cmd spring-boot:run"
start "8 analytics-service :8087"      cmd /k "cd analyticsservice && mvnw.cmd spring-boot:run"

echo Waiting 45 seconds before starting the gateway...
timeout /t 45 /nobreak >nul
start "9 api-gateway :8080" cmd /k "cd apigateway && mvnw.cmd spring-boot:run"

echo.
echo All services launched in separate windows.
echo Check http://localhost:8761 - all 8 services should appear.
echo Then in a NEW cmd window:  cd frontend  ^&^&  npm install  ^&^&  npm run dev
pause
