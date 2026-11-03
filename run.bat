@echo off
chcp 65001 >nul
title GLM-OCR Studio Launcher

echo ======================================================================
echo                GLM-OCR Studio - Local Markdown OCR
echo ======================================================================
echo.

cd /d "%~dp0"

:: 1. Verifica presenza di Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERRORE] Python non e stato trovato nel PATH di sistema.
    echo Assicurati che Python 3.10+ sia installato e aggiunto al PATH.
    echo.
    pause
    exit /b 1
)

:: 2. Controllo servizio Ollama locale
echo [1/3] Verifica servizio Ollama su http://localhost:11434...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [AVVISO] Il servizio Ollama non sembra attivo o raggiungibile su porta 11434.
    echo          Verifica che l'applicazione Ollama sia aperta o esegui 'ollama serve'
    echo          in un altro terminale. L'applicazione prosegue comunque.
    echo.
) else (
    echo [1/3] Ollama e attivo e funzionante!
)

:: 3. Avvio di run.py (esegue controllo porta, avvia Uvicorn e apre Microsoft Edge)
echo [2/3] Verifica porta, avvio server Uvicorn e apertura Microsoft Edge...
echo.

python run.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRORE] Si e verificato un errore durante l'esecuzione del server.
    pause
)
