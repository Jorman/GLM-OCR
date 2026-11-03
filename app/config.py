import os
import sys
import json
import tempfile
from enum import Enum
from pathlib import Path

class PageStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"

# Paths
if getattr(sys, 'frozen', False):
    # Se impacchettato con PyInstaller, i file statici risiedono in sys._MEIPASS
    BASE_DIR = Path(sys._MEIPASS)
    # La directory dell'eseguibile reale (dove si trova .exe)
    EXE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent
    EXE_DIR = BASE_DIR

# Usa la cartella temporanea di sistema (es. C:\Users\<user>\AppData\Local\Temp\GLM-OCR)
SYSTEM_TEMP_ROOT = Path(tempfile.gettempdir())
TEMP_DIR = Path(os.getenv("GLM_OCR_TEMP_DIR", SYSTEM_TEMP_ROOT / "GLM-OCR"))
TEMP_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR = TEMP_DIR

# File di configurazione persistente su disco (salvato accanto all'eseguibile o in AppData se protetto)
APPDATA_DIR = Path(os.getenv("APPDATA", str(EXE_DIR))) / "GLM-OCR"
APPDATA_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = APPDATA_DIR / "config.json"

DEFAULT_CONFIG = {
    "ollama_base_url": "http://localhost:11434",
    "default_model": "glm-ocr:latest",
    "default_dpi": 200,
    "temperature": 0.0
}

def load_user_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                cfg = {**DEFAULT_CONFIG, **data}
                # Se la configurazione ha il vecchio default 0.1, migra a 0.0 per coerenza con GLM-OCR
                if cfg.get("temperature") == 0.1:
                    cfg["temperature"] = 0.0
                return cfg
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()

def save_user_config(new_config: dict) -> bool:
    try:
        current = load_user_config()
        current.update(new_config)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False

# Caricamento configurazioni iniziali
_cfg = load_user_config()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", _cfg.get("ollama_base_url", "http://localhost:11434"))
DEFAULT_MODEL = os.getenv("GLM_OCR_MODEL", _cfg.get("default_model", "glm-ocr:latest"))
DEFAULT_DPI = int(os.getenv("PDF_DPI", str(_cfg.get("default_dpi", 200))))
DEFAULT_TEMPERATURE = float(_cfg.get("temperature", 0.0))
MAX_UPLOAD_SIZE_MB = 100

# OCR Task Prompts for GLM-OCR
PROMPT_PRESETS = {
    "text": {
        "label": "Riconoscimento Testo Generale",
        "prompt": "Text Recognition:"
    },
    "table": {
        "label": "Riconoscimento Tabelle Strutturate",
        "prompt": "Table Recognition:"
    },
    "formula": {
        "label": "Riconoscimento Formule Matematiche",
        "prompt": "Formula Recognition:"
    },
    "custom": {
        "label": "Prompt Personalizzato",
        "prompt": ""
    }
}

# Inference Defaults (verified for GLM-OCR on Ollama)
DEFAULT_OPTIONS = {
    "temperature": 0.0,
    "repeat_penalty": 1.20,
    "repeat_last_n": 512,
    "num_ctx": 8192,
    "num_predict": 4096,
    "stop": ["<|endoftext|>", "<|user|>", "<|observation|>", "\n\n```\n", "```markdown\n\n```"]
}
