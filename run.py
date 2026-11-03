import os
import sys
import socket
import time
import threading
import subprocess
import webbrowser
import urllib.request
import uvicorn

try:
    import webview
    HAS_PYWEBVIEW = True
except ImportError:
    HAS_PYWEBVIEW = False

DEFAULT_PORT = 8000
HOST = "127.0.0.1"

def is_port_in_use(port: int, host: str = HOST) -> bool:
    """Verifica se una porta è già occupata."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def find_available_port(start_port: int = DEFAULT_PORT, max_attempts: int = 20) -> int:
    """Trova la prima porta libera a partire da start_port."""
    for port in range(start_port, start_port + max_attempts):
        if not is_port_in_use(port):
            return port
    raise RuntimeError(f"Nessuna porta libera trovata nell'intervallo {start_port}-{start_port + max_attempts}")

def wait_for_server(url: str, timeout: float = 15.0) -> bool:
    """Attende che il server risponda con codice 200."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    return False

def open_in_browser_fallback(url: str):
    """Fallback al browser predefinito o Edge se pywebview non è disponibile."""
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for path in edge_paths:
        if os.path.exists(path):
            try:
                subprocess.Popen([path, f"--app={url}"])
                return
            except Exception:
                pass
    webbrowser.open(url)

class UvicornServer(uvicorn.Server):
    """Server Uvicorn controllabile programmaticamente per l'arresto pulito."""
    def install_signal_handlers(self):
        pass

def run_uvicorn_in_thread(server: UvicornServer):
    server.run()

def main():
    # 1. Trova una porta libera
    target_port = DEFAULT_PORT
    if is_port_in_use(target_port):
        try:
            target_port = find_available_port(DEFAULT_PORT + 1)
        except Exception as e:
            sys.exit(1)

    app_url = f"http://{HOST}:{target_port}"
    health_url = f"{app_url}/api/health"

    # 2. Configura e avvia il server FastAPI in un thread background
    from app.main import app
    config = uvicorn.Config(
        app,
        host=HOST,
        port=target_port,
        log_level="warning",
        reload=False
    )
    server = UvicornServer(config=config)
    server_thread = threading.Thread(target=run_uvicorn_in_thread, args=(server,), daemon=True)
    server_thread.start()

    # 3. Attende che il server sia pronto
    wait_for_server(health_url, timeout=15.0)

    # 4. Avvio interfaccia utente: PyWebView (finestra desktop dedicata senza DOS) o fallback
    if HAS_PYWEBVIEW:
        def on_closed():
            # Alla chiusura della finestra, arresta Uvicorn e pulisce
            server.should_exit = True
            try:
                from app.main import doc_manager
                doc_manager.clear_all()
            except Exception:
                pass

        window = webview.create_window(
            title="GLM-OCR Studio",
            url=app_url,
            width=1380,
            height=880,
            min_size=(1024, 680),
            background_color="#090d16"
        )
        window.events.closed += on_closed
        webview.start(gui="edgechromium")
    else:
        open_in_browser_fallback(app_url)
        try:
            while server_thread.is_alive():
                time.sleep(1)
        except KeyboardInterrupt:
            server.should_exit = True

if __name__ == "__main__":
    main()
