@echo off
setlocal
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0open-downloads.ps1" %*
if errorlevel 1 pause
exit /b %ERRORLEVEL%
