@echo off
setlocal
cd /d "%~dp0"
start "AI Interview Backend" "%~dp0AIInterviewBackend.exe"
start "AI Interview Frontend" cmd /c "cd /d %~dp0frontend && npx --yes serve -s . -l 4173"
start "" http://localhost:4173
endlocal
