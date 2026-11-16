@echo off
setlocal
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "YTST_EXIT=%ERRORLEVEL%"
echo.
if not "%YTST_EXIT%"=="0" echo Install failed. Read the message above.
pause
exit /b %YTST_EXIT%
