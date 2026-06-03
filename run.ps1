# run.ps1
# Setup and run script for Football Analytics Intelligence Platform (FAIP)

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   FAIP | Football Analytics Intelligence Platform   " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Check Python
Write-Host "[*] Checking Python installation..." -ForegroundColor Gray
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python is not installed or not in PATH. Please install Python."
    exit 1
}

# 2. Check Node
Write-Host "[*] Checking Node.js/npm installation..." -ForegroundColor Gray
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js/npm is not installed or not in PATH. Please install Node.js."
    exit 1
}

# 3. Setup Backend Virtual Environment
Write-Host "[*] Setting up Python virtual environment..." -ForegroundColor Yellow
if (-not (Test-Path "backend\venv")) {
    Write-Host "    Virtual environment not found in backend/venv. Creating..." -ForegroundColor Gray
    python -m venv backend\venv
}

Write-Host "[*] Installing backend dependencies..." -ForegroundColor Yellow
& "backend\venv\Scripts\pip.exe" install -r backend\requirements.txt

# 4. Seed Database if needed
$dbPath = "backend\faip.db"
if (-not (Test-Path $dbPath) -or (Get-Item $dbPath).Length -lt 1024) {
    Write-Host "[*] Database not seeded. Seeding StatsBomb data (this might take a minute)..." -ForegroundColor Yellow
    & "backend\venv\Scripts\python.exe" scripts\seed_statsbomb.py
} else {
    Write-Host "[*] Database already exists ($([Math]::Round((Get-Item $dbPath).Length / 1MB, 2)) MB). Skipping seeding." -ForegroundColor Green
}

# 5. Setup Frontend
Write-Host "[*] Setting up frontend..." -ForegroundColor Yellow
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "    node_modules not found. Running npm install..." -ForegroundColor Gray
    Push-Location frontend
    npm install
    Pop-Location
}

if (-not (Test-Path "frontend\.env.local")) {
    Write-Host "    Creating .env.local for frontend..." -ForegroundColor Gray
    "NEXT_PUBLIC_API_URL=http://localhost:8000`n" | Out-File -FilePath "frontend\.env.local" -NoNewline -Encoding utf8
}

# 6. Start processes in new windows
Write-Host "[*] Launching Backend & Frontend..." -ForegroundColor Green
Write-Host "    Backend will run at: http://localhost:8000" -ForegroundColor Gray
Write-Host "    Frontend will run at: http://localhost:3000" -ForegroundColor Gray

# Start Backend in a new window
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd backend; .\venv\Scripts\activate; uvicorn main:app --host 0.0.0.0 --port 8000"

# Start Frontend in a new window
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host ""
Write-Host "[+] FAIP is starting up! Monitor backend/frontend logs in the newly opened terminal windows." -ForegroundColor Green
Write-Host "[+] Open http://localhost:3000 in your browser to explore the platform." -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
