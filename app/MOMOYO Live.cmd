@echo off
cd /d "%~dp0"
if not exist "%~dp0python\python.exe" (
  echo Ekstrak semua isi ZIP sebelum menjalankan MOMOYO.
  pause
  exit /b 1
)
"%~dp0python\python.exe" "%~dp0launcher.py"
if errorlevel 1 pause
