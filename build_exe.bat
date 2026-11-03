@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo       Building GLM-OCR Studio Standalone Executable
echo ========================================================

echo Closing any existing running instances...
taskkill /F /IM GLM-OCR-Studio.exe >nul 2>&1

echo Cleaning build and dist directories...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo Verifying and updating glm-ocr:latest model in local Ollama...
where ollama >nul 2>nul
if %ERRORLEVEL% equ 0 (
    ollama pull glm-ocr:latest
)

echo Installing and verifying build dependencies...
python -m pip install pyinstaller pywebview

echo Starting compilation with PyInstaller...
python -m PyInstaller --clean --noconfirm --onedir --noconsole --name "GLM-OCR-Studio" --add-data "static;static" --collect-all uvicorn --collect-all fastapi --collect-all webview run.py

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo Build completed successfully!
    echo Standalone executable directory: dist\GLM-OCR-Studio\
    echo ========================================================
) else (
    echo.
    echo ERROR: PyInstaller build failed.
)
pause
