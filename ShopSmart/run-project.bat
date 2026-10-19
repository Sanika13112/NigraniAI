@echo off
REM ShopSmart: start the whole project (frontend + 9 backend services).
REM Keep this file in the ShopSmart folder, next to start-backend.bat, and double-click it.
cd /d "%~dp0"

echo Stopping anything still running...
call "%~dp0stop-project.bat" quiet

echo Clearing old compiled code so every update is rebuilt...
for /d %%d in ("%~dp0backend\*") do if exist "%%d\target" rmdir /s /q "%%d\target"

echo Starting frontend...
if not exist "%~dp0frontend\node_modules" (
  start "10 frontend :5173" cmd /k "cd /d "%~dp0frontend" && npm install && npm run dev"
) else (
  start "10 frontend :5173" cmd /k "cd /d "%~dp0frontend" && npm run dev"
)

if exist "%~dp0guardrail.env.bat" (
  echo Starting log shipper to GuardRail...
  start "11 log-shipper" cmd /k ""%~dp0start-log-shipper.bat""
)

echo.
echo ShopSmart is starting. Backend services take 2-3 minutes (they are rebuilt first).
echo When all windows show "Started ...Application", open:  http://localhost:5173
echo To stop everything later, run stop-project.bat
echo.
echo Starting backend services...
call "%~dp0start-backend.bat"
