param(
  [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

Write-Host "Installing PyInstaller..."
& $PythonExe -m pip install --upgrade pyinstaller

Write-Host "Building frontend..."
Push-Location frontend
npm install
npm run build
Pop-Location

Write-Host "Building backend exe..."
& $PythonExe -m PyInstaller --onefile --name AIInterviewBackend backend/backend.py

Write-Host "Building Windows 11 desktop app (Electron)..."
Push-Location desktop
npm install
npm run build:win11
Pop-Location

Write-Host "Done. Installer available in desktop/dist"
