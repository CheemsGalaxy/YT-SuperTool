@echo off
setlocal
cd /d "%TEMP%"
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set "YTST_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %YTST_EXIT%
