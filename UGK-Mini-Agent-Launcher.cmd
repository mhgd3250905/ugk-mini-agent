@echo off
setlocal
cd /d "%~dp0"
title UGK Mini Agent Launcher

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Please install Node.js or open this launcher from a configured terminal.
  pause
  exit /b 1
)

node scripts\native-launcher.mjs %*
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo Launcher exited with code %EXIT_CODE%.
) else (
  echo Launcher stopped.
)
pause
exit /b %EXIT_CODE%
