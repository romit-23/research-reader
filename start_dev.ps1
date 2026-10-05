Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting Research Reader (FastAPI Backend + React Frontend)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; ..\venv\Scripts\activate; python run.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "Backend API:  http://localhost:8000/docs" -ForegroundColor Green
Write-Host "Frontend App: http://localhost:5173" -ForegroundColor Green
