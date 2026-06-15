Write-Host "==========================================" -ForegroundColor Green
Write-Host "Starting TelePlay Backend and Frontend..." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Start Backend in a new window
Start-Process cmd -ArgumentList '/k "echo Starting Backend... && cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"' -WindowStyle Normal

# Start Frontend in a new window
Start-Process cmd -ArgumentList '/k "echo Starting Web Frontend... && cd web && npm run dev"' -WindowStyle Normal

Write-Host ""
Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
