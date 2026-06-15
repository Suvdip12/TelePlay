@echo off
title TelePlay - Local Development
echo ==========================================
echo Starting TelePlay Backend and Frontend...
echo ==========================================

:: Start Python Backend in a new terminal window
start cmd /k "echo Starting Backend... && cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

:: Start Vite Frontend in a new terminal window
start cmd /k "echo Starting Web Frontend... && cd web && npm run dev"

echo.
echo Backend started on http://127.0.0.1:8000
echo Frontend started on http://localhost:3000
echo Enjoy streaming!
echo.
pause
