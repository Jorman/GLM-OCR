import base64
import time
import re
import json
from pathlib import Path
from typing import Dict, Any, Optional, List, AsyncGenerator
import httpx
from PIL import Image, ImageStat

from app.config import OLLAMA_BASE_URL, DEFAULT_MODEL, DEFAULT_OPTIONS

def is_blank_image(image_path: Path, variance_threshold: float = 2.0) -> bool:
    """
    Rileva se un'immagine è vuota o priva di contenuto (es. foglio bianco o quasi bianco).
    Utilizza la varianza dei pixel sui canali colore: se la varianza media è inferiore
    alla soglia (es. un foglio completamente bianco ha varianza 0.0), l'immagine è considerata vuota.
    """
    try:
        if not image_path.exists():
            return False
        with Image.open(image_path) as img:
            stat = ImageStat.Stat(img)
            avg_var = sum(stat.var) / len(stat.var)
            avg_mean = sum(stat.mean) / len(stat.mean)
            return avg_var < variance_threshold and avg_mean > 240.0
    except Exception:
        return False

class OcrEngine:
    def __init__(self, base_url: str = OLLAMA_BASE_URL, model: str = DEFAULT_MODEL):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def check_health(self, base_url: Optional[str] = None, model: Optional[str] = None) -> Dict[str, Any]:
        """Verifica se Ollama è raggiungibile e controlla la presenza del modello specificato."""
        target_url = (base_url or self.base_url).rstrip("/")
        target_model = model or self.model
        url = f"{target_url}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name", "") for m in data.get("models", [])]
                    has_model = any(target_model in m or m in target_model for m in models)
                    return {
                        "online": True,
                        "models": models,
                        "has_requested_model": has_model,
                        "current_model": target_model,
                        "base_url": target_url
                    }
                return {
                    "online": False,
                    "error": f"Ollama ha risposto con codice di stato {res.status_code}",
                    "base_url": target_url
                }
        except Exception as e:
            return {
                "online": False,
                "error": f"Connessione a Ollama fallita: {str(e)}",
                "base_url": target_url
            }

    async def pull_model_stream(self, model: str, base_url: Optional[str] = None) -> AsyncGenerator[str, None]:
        """Esegue il pull (download) di un modello da Ollama generando aggiornamenti SSE."""
        target_url = (base_url or self.base_url).rstrip("/")
        url = f"{target_url}/api/pull"
        payload = {"name": model, "stream": True}

        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield f"data: {json.dumps({'status': 'error', 'error': f'Codice HTTP {response.status_code}: {err_text.decode()}'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                            yield f"data: {json.dumps(data)}\n\n"
                            if data.get("status") == "success":
                                break
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"

    @staticmethod
    def encode_image(image_path: Path) -> str:
        """Codifica un file immagine in base64 string."""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    @staticmethod
    def clean_markdown_output(text: str) -> str:
        """
        Pulisce e normalizza il risultato OCR generato da GLM-OCR:
        - Rimuove eventuali blocchi ```markdown ... ``` esterni di wrapping
        - Rimuove token speciali (<|endoftext|>, etc.)
        - Rimuove artefatti di fine generazione (es. ripetizioni finali di ``` o ---)
        """
        if not text:
            return ""

        cleaned = text.strip()

        # Se il testo intero è racchiuso da ```markdown ... ``` o ``` ... ```, estrai l'interno
        pattern = r"^```(?:markdown)?\s*\n([\s\S]*?)\n```$"
        match = re.match(pattern, cleaned)
        if match:
            cleaned = match.group(1).strip()
        elif cleaned.startswith("```markdown\n"):
            cleaned = cleaned[len("```markdown\n"):].strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()

        # Rimuove token speciali
        for special_tok in ["<|endoftext|>", "<|user|>", "<|observation|>", "<|system|>"]:
            cleaned = cleaned.replace(special_tok, "")

        # Rimuove frasi conversazionali o pensieri tipici dei loop LLM non pertinenti all'OCR
        cleaned = re.sub(r'(?im)^.*?\b(wait,\s*let\s*me\s*re-read|i\s*will\s*output\s*this|the\s*text\s*is\s*clearly\s*visible).*?$\n?', '', cleaned)

        # Collassa eventuali loop degenerativi di singole parole ripetute in modo anomalo (>= 5 volte consecutive)
        cleaned = re.sub(r'(\b[A-Za-z0-9_]{3,}\b)(?:\s+\1){4,}', r'\1', cleaned)

        # Rimuove sequenze ripetitive finali tipiche (es. multiple righe di ``` o --- alla fine)
        cleaned = re.sub(r'(\s*```)+\s*$', '', cleaned)
        cleaned = re.sub(r'(\n---){3,}\s*$', '', cleaned)

        # Deduplica paragrafi identici generati da loop autoregressivi
        paragraphs = cleaned.split("\n\n")
        seen_blocks = set()
        dedup_paragraphs = []
        for p in paragraphs:
            norm = p.strip()
            if not norm:
                continue
            if norm not in seen_blocks:
                seen_blocks.add(norm)
                dedup_paragraphs.append(norm)
        cleaned = "\n\n".join(dedup_paragraphs)

        return cleaned.strip()

    async def recognize_image(
        self,
        image_path: Path,
        prompt: str = "Text Recognition:",
        model: Optional[str] = None,
        custom_options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Esegue inferenza OCR completa (non-streaming)."""
        raw_output = ""
        duration = 0.0
        done_reason = None
        
        async for chunk in self.recognize_image_stream(
            image_path=image_path,
            prompt=prompt,
            model=model,
            custom_options=custom_options
        ):
            if chunk["type"] == "token":
                raw_output += chunk.get("token", "")
            elif chunk["type"] == "done":
                return {
                    "success": True,
                    "error": None,
                    "raw_output": chunk.get("raw_output", raw_output),
                    "markdown": chunk.get("markdown", ""),
                    "duration_seconds": chunk.get("duration_seconds", 0.0),
                    "done_reason": chunk.get("done_reason")
                }
            elif chunk["type"] == "error":
                return {
                    "success": False,
                    "error": chunk.get("error"),
                    "raw_output": raw_output,
                    "markdown": "",
                    "duration_seconds": chunk.get("duration_seconds", 0.0)
                }
                
        cleaned = self.clean_markdown_output(raw_output)
        return {
            "success": True,
            "error": None,
            "raw_output": raw_output,
            "markdown": cleaned,
            "duration_seconds": duration,
            "done_reason": done_reason
        }

    async def recognize_image_stream(
        self,
        image_path: Path,
        prompt: str = "Text Recognition:",
        model: Optional[str] = None,
        custom_options: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Esegue l'inferenza OCR in streaming reale da Ollama.
        Produce chunk per ogni token generato e un messaggio finale di completamento.
        """
        if not image_path.exists():
            yield {"type": "error", "error": f"File immagine non trovato: {image_path}", "duration_seconds": 0.0}
            return

        if is_blank_image(image_path):
            yield {
                "type": "done",
                "raw_output": "<!-- Pagina vuota -->",
                "markdown": "<!-- Pagina vuota -->",
                "duration_seconds": 0.01,
                "done_reason": "blank_page"
            }
            return

        target_model = model or self.model
        b64_image = self.encode_image(image_path)

        options = dict(DEFAULT_OPTIONS)
        if custom_options:
            options.update(custom_options)

        payload = {
            "model": target_model,
            "prompt": prompt if prompt.strip() else "Text Recognition:",
            "system": "You are a specialized OCR tool. Extract only the visible text into clean Markdown. Do not include thoughts, reasoning, conversational commentary, or duplicate output.",
            "images": [b64_image],
            "stream": True,
            "options": options
        }

        url = f"{self.base_url}/api/generate"
        t0 = time.time()
        raw_accumulated = []
        done_reason = None

        try:
            # Connessione streaming HTTP verso Ollama
            async with httpx.AsyncClient(timeout=180.0) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        err_body = await response.aread()
                        yield {
                            "type": "error",
                            "error": f"Ollama HTTP {response.status_code}: {err_body.decode('utf-8', errors='ignore')}",
                            "duration_seconds": time.time() - t0
                        }
                        return

                    async for line in response.aiter_lines():
                        if not line or not line.strip():
                            continue
                        try:
                            chunk_data = json.loads(line)
                            tok = chunk_data.get("response", "")
                            if tok:
                                raw_accumulated.append(tok)
                                yield {
                                    "type": "token",
                                    "token": tok,
                                    "elapsed": round(time.time() - t0, 2)
                                }
                                # Protezione contro loop degenerativi autoregressivi (parola identica ripetuta >= 6 volte o fences >= 4 volte)
                                if len(raw_accumulated) >= 6:
                                    tail_str = "".join(raw_accumulated[-30:])
                                    if re.search(r'(\b[A-Za-z0-9_]{3,}\b)(?:\s+\1){5,}', tail_str) or re.search(r'(?:\s*```){4,}', tail_str):
                                        done_reason = "repetition_guard"
                                        break
                                # Rilevamento duplicazione blocchi / paragrafi completi (finestra scorrevole >= 30 caratteri)
                                if len(raw_accumulated) >= 20:
                                    current_full = "".join(raw_accumulated)
                                    if len(current_full) > 100:
                                        tail_block = current_full[-50:].strip()
                                        earlier_text = current_full[:-50]
                                        if len(tail_block) >= 30 and tail_block in earlier_text:
                                            done_reason = "block_repetition_guard"
                                            break
                            if chunk_data.get("done", False):
                                done_reason = chunk_data.get("done_reason")
                                break
                        except json.JSONDecodeError:
                            continue

            elapsed = round(time.time() - t0, 2)
            full_raw = "".join(raw_accumulated)
            cleaned_md = self.clean_markdown_output(full_raw)

            yield {
                "type": "done",
                "raw_output": full_raw,
                "markdown": cleaned_md,
                "duration_seconds": elapsed,
                "done_reason": done_reason
            }

        except httpx.ConnectError:
            yield {
                "type": "error",
                "error": f"Impossibile connettersi a Ollama su {self.base_url}. Verifica che Ollama sia attivo.",
                "duration_seconds": time.time() - t0
            }
        except httpx.TimeoutException:
            yield {
                "type": "error",
                "error": "Timeout connessione a Ollama (>180s).",
                "duration_seconds": time.time() - t0
            }
        except Exception as e:
            yield {
                "type": "error",
                "error": f"Errore durante lo streaming OCR: {str(e)}",
                "duration_seconds": time.time() - t0
            }
