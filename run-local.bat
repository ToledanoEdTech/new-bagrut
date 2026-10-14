@echo off
cd /d "%~dp0"

REM Double-click this file to open the site locally.
REM ASCII only: Windows runs this before the console is UTF-8.
REM The PowerShell script does the real work.
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%PATH%"
title Bagrut - local

where powershell >nul 2>&1
if errorlevel 1 (
    echo ERROR: PowerShell was not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-local.ps1"
if errorlevel 1 (
    echo.
    echo The local server failed to start.
    pause
)
