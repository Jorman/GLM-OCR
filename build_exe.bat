@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo       Building GLM-OCR Studio Standalone Executable
echo ========================================================

echo Chiusura di eventuali istanze precedenti in esecuzione...
taskkill /F /IM GLM-OCR-Studio.exe >nul 2>&1

echo Pulizia delle cartelle build e dist...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo Installazione e verifica dipendenze di build...
python -m pip install pyinstaller pywebview

echo Avvio compilazione con PyInstaller...
python -m PyInstaller --clean --noconfirm --onedir --noconsole --name "GLM-OCR-Studio" --add-data "static;static" --collect-all uvicorn --collect-all fastapi --collect-all webview run.py

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo Build completata con successo!
    echo Il pacchetto eseguibile si trova in: dist\GLM-OCR-Studio\
    echo ========================================================
) else (
    echo.
    echo ERRORE: La build con PyInstaller e fallita.
)
pause
