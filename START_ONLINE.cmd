@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  type "%~dp0scripts\node-required.txt"
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  type "%~dp0scripts\node-required.txt"
  pause
  exit /b 1
)
call npm.cmd run dev:online
set "ONLINE_EXIT=%ERRORLEVEL%"
if "%ONLINE_EXIT%"=="0" exit /b 0
if "%ONLINE_EXIT%"=="130" exit /b 0
if "%ONLINE_EXIT%"=="-1073741510" exit /b 0
if "%ONLINE_EXIT%"=="3221225786" exit /b 0
echo.
pause
exit /b %ONLINE_EXIT%

