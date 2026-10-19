@echo off
REM Sends ShopSmart logs to the GuardRail logs project (needs guardrail.env.bat and Python).
cd /d "%~dp0"
if not exist "%~dp0guardrail.env.bat" (
  echo guardrail.env.bat not found. Copy guardrail.env.example.bat to guardrail.env.bat and fill it in.
  pause
  exit /b 1
)
call "%~dp0guardrail.env.bat"
python -m pip install -q -r tools\requirements.txt
python tools\log-shipper\ship_logs.py
