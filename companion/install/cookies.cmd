@echo off
setlocal
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0cookies.ps1" %*
set "YTST_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %YTST_EXIT%
