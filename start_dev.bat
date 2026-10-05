@echo off
echo ========================================================
echo Starting Research Reader (FastAPI Backend + React Frontend)
echo ========================================================

echo Starting FastAPI Backend on http://localhost:8000 ...
start "Research Reader - Backend" cmd /k "cd backend && ..\venv\Scripts\activate && python run.py"

echo Starting Vite React Frontend on http://localhost:5173 ...
start "Research Reader - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are launching!
echo Backend API Docs: http://localhost:8000/docs
echo Frontend App:     http://localhost:5173
echo ========================================================
pause
