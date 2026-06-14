@echo off
setlocal
cd /d "%~dp0"
title UGK Mini Agent Update

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Please install Node.js or open this updater from a configured terminal.
  pause
  exit /b 1
)

node scripts\native-updater.mjs %*
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo Updater exited with code %EXIT_CODE%.
) else (
  echo Updater finished.
)
pause
exit /b %EXIT_CODE%
