@echo off
chcp 65001 >nul
title GLM-OCR Studio Launcher

echo ======================================================================
echo                GLM-OCR Studio - Local Markdown OCR
echo ======================================================================
echo.

cd /d "%~dp0"

:: 1. Verify Python availability
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python was not found in system PATH.
    echo Please make sure Python 3.10+ is installed and added to PATH.
    echo.
    pause
    exit /b 1
)

:: 2. Check local Ollama service and ensure glm-ocr:latest is pulled
echo [1/3] Checking Ollama service at http://localhost:11434...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Ollama service not reachable on port 11434.
    echo           Please ensure Ollama is running ('ollama serve').
    echo           Continuing launch...
    echo.
) else (
    echo [1/3] Ollama service is active.
    echo [2/3] Checking/updating model glm-ocr:latest...
    where ollama >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        ollama pull glm-ocr:latest
    )
)

:: 3. Launch run.py (port check, start Uvicorn, open browser / webview)
echo.
echo [3/3] Starting server and opening interface...
echo.

python run.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] An error occurred during server execution.
    pause
)
