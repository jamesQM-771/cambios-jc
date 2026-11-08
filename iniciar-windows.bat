@echo off
rem Doble clic para iniciar Cambios JC en Windows (no usa Git ni GitHub).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-windows.ps1"
pause
