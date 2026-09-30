@echo off
where pwsh.exe >nul 2>nul
if %errorlevel% equ 0 (
  pwsh.exe -NoProfile -File "%~dp0start.ps1"
) else (
  powershell.exe -NoProfile -File "%~dp0start.ps1"
)
if errorlevel 1 pause
