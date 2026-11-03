import json
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import (
    BASE_DIR,
    OLLAMA_BASE_URL,
    DEFAULT_MODEL,
    DEFAULT_DPI,
    DEFAULT_TEMPERATURE,
    MAX_UPLOAD_SIZE_MB,
    PROMPT_PRESETS,
    PageStatus,
    load_user_config,
    save_user_config
)
from app.ocr_engine import OcrEngine
from app.document_manager import DocumentManager
from app.pdf_converter import convert_document_to_pages_stream

# Managers
doc_manager = DocumentManager()
ocr_engine = OcrEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Avvio: assicura che la directory temporanea esista pulita o pronta
    yield
    # Chiusura: svuota i file temporanei all'arresto dell'applicazione
    try:
        doc_manager.clear_all()
    except Exception:
        pass

app = FastAPI(
    title="GLM-OCR Document Studio",
    description="Convert dirty scans and PDFs into clean Markdown using local GLM-OCR",
    version="1.1.0",
    lifespan=lifespan
)

# Models
class PageOcrRequest(BaseModel):
    prompt: Optional[str] = "Text Recognition:"
    model: Optional[str] = None
    temperature: Optional[float] = 0.1

class PageEditRequest(BaseModel):
    markdown: str

class OllamaConfigRequest(BaseModel):
    ollama_url: Optional[str] = None
    model: Optional[str] = None
    dpi: Optional[int] = None
    temperature: Optional[float] = None

# API Endpoints
@app.get("/api/health")
async def health_check(url: Optional[str] = None, model: Optional[str] = None):
    """Verifica lo stato di Ollama e la presenza del modello specificato o di default."""
    status = await ocr_engine.check_health(base_url=url, model=model)
    return status

@app.post("/api/ollama/pull")
async def pull_model(request: OllamaConfigRequest):
    """Scarica un modello dal repository Ollama tramite Server-Sent Events."""
    target_model = request.model or ocr_engine.model
    target_url = request.ollama_url or ocr_engine.base_url
    return StreamingResponse(
        ocr_engine.pull_model_stream(model=target_model, base_url=target_url),
        media_type="text/event-stream"
    )

@app.post("/api/settings/update")
async def update_settings(request: OllamaConfigRequest):
    """Aggiorna le configurazioni globali dell'OcrEngine e le persiste su disco."""
    updates = {}
    if request.ollama_url:
        ocr_engine.base_url = request.ollama_url.rstrip("/")
        updates["ollama_base_url"] = ocr_engine.base_url
    if request.model:
        ocr_engine.model = request.model
        updates["default_model"] = ocr_engine.model
    if request.dpi:
        updates["default_dpi"] = request.dpi
    if request.temperature is not None:
        updates["temperature"] = request.temperature

    save_user_config(updates)
    return {
        "success": True,
        "base_url": ocr_engine.base_url,
        "model": ocr_engine.model
    }

@app.get("/api/config")
async def get_configuration():
    """Restituisce le configurazioni salvate su disco e i preset dei prompt."""
    cfg = load_user_config()
    return {
        "ollama_base_url": cfg.get("ollama_base_url", ocr_engine.base_url),
        "default_model": cfg.get("default_model", ocr_engine.model),
        "default_dpi": cfg.get("default_dpi", DEFAULT_DPI),
        "temperature": cfg.get("temperature", DEFAULT_TEMPERATURE),
        "prompts": PROMPT_PRESETS
    }

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    dpi: int = Form(DEFAULT_DPI),
    async_convert: bool = Form(False)
):
    """Carica un documento (PDF o immagine) e lo registra. Se async_convert=True, inizializza e delega la conversione a convert-stream."""
    filename = file.filename or "uploaded_file"
    contents = await file.read()

    max_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Il file supera la dimensione massima consentita di {MAX_UPLOAD_SIZE_MB} MB."
        )

    try:
        if async_convert:
            doc = doc_manager.create_document_initial(
                file_bytes=contents,
                original_filename=filename,
                dpi=dpi
            )
            return {
                "success": True,
                "document": doc,
                "async_convert": True,
                "stream_url": f"/api/document/{doc['doc_id']}/convert-stream?dpi={dpi}"
            }
        else:
            doc = doc_manager.create_document_from_upload(
                file_bytes=contents,
                original_filename=filename,
                dpi=dpi
            )
            return {
                "success": True,
                "document": doc,
                "async_convert": False
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/document/{doc_id}/convert-stream")
async def stream_document_conversion(doc_id: str, dpi: Optional[int] = None):
    """Esegue la conversione delle pagine in immagini PNG trasmettendo l'avanzamento in streaming SSE."""
    doc = doc_manager.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    upload_path = Path(doc["file_path"])
    if not upload_path.exists():
        raise HTTPException(status_code=404, detail="File sorgente del documento non trovato")

    target_dpi = dpi or doc.get("dpi", DEFAULT_DPI)
    pages_dir = upload_path.parent / "pages"

    async def event_generator():
        for update in convert_document_to_pages_stream(upload_path, pages_dir, dpi=target_dpi):
            if update["type"] == "progress":
                yield f"data: {json.dumps(update)}\n\n"
                await asyncio.sleep(0.001)
            elif update["type"] == "completed":
                final_doc = doc_manager.finalize_document_pages(doc_id, update["pages"])
                yield f"data: {json.dumps({'type': 'completed', 'document': final_doc})}\n\n"
                return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/api/document/{doc_id}")
async def get_document_info(doc_id: str):
    doc = doc_manager.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    return doc

@app.get("/api/document/{doc_id}/page/{page_num}/image")
async def get_page_image(doc_id: str, page_num: int):
    page = doc_manager.get_page(doc_id, page_num)
    if not page:
        raise HTTPException(status_code=404, detail="Pagina non trovata")
    
    img_path = Path(page["file_path"])
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="File immagine non trovato")
    
    return FileResponse(img_path, media_type="image/png")

@app.get("/api/document/{doc_id}/page/{page_num}/ocr-stream")
async def stream_single_page_ocr(
    doc_id: str,
    page_num: int,
    prompt: Optional[str] = "Text Recognition:",
    model: Optional[str] = None
):
    """Esegue OCR su una singola pagina trasmettendo i token in streaming reale SSE."""
    page = doc_manager.get_page(doc_id, page_num)
    if not page:
        raise HTTPException(status_code=404, detail="Pagina non trovata")

    img_path = Path(page["file_path"])
    doc_manager.set_page_status(doc_id, page_num, PageStatus.PROCESSING)

    async def single_stream_generator():
        yield f"data: {json.dumps({'type': 'start', 'page_num': page_num})}\n\n"

        async for chunk in ocr_engine.recognize_image_stream(
            image_path=img_path,
            prompt=prompt or "Text Recognition:",
            model=model
        ):
            if chunk["type"] == "token":
                yield f"data: {json.dumps({'type': 'token', 'token': chunk['token'], 'page_num': page_num})}\n\n"
            elif chunk["type"] == "done":
                updated = doc_manager.update_page_ocr(
                    doc_id=doc_id,
                    page_num=page_num,
                    ocr_result=chunk["markdown"],
                    raw_output=chunk["raw_output"],
                    status="completed",
                    duration=chunk["duration_seconds"]
                )
                yield f"data: {json.dumps({'type': 'done', 'page': updated})}\n\n"
            elif chunk["type"] == "error":
                updated = doc_manager.update_page_ocr(
                    doc_id=doc_id,
                    page_num=page_num,
                    ocr_result="",
                    raw_output="",
                    status="error",
                    duration=chunk.get("duration_seconds", 0.0),
                    error_message=chunk["error"]
                )
                yield f"data: {json.dumps({'type': 'error', 'error': chunk['error'], 'page': updated})}\n\n"

    return StreamingResponse(
        single_stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/api/document/{doc_id}/page/{page_num}/ocr")
async def process_single_page(
    doc_id: str,
    page_num: int,
    req: PageOcrRequest
):
    """Esegue OCR su una singola pagina (endpoint non-streaming compatibile)."""
    page = doc_manager.get_page(doc_id, page_num)
    if not page:
        raise HTTPException(status_code=404, detail="Pagina non trovata")

    img_path = Path(page["file_path"])
    doc_manager.set_page_status(doc_id, page_num, PageStatus.PROCESSING)

    options = {}
    if req.temperature is not None:
        options["temperature"] = req.temperature

    result = await ocr_engine.recognize_image(
        image_path=img_path,
        prompt=req.prompt or "Text Recognition:",
        model=req.model,
        custom_options=options
    )

    if result["success"]:
        updated = doc_manager.update_page_ocr(
            doc_id=doc_id,
            page_num=page_num,
            ocr_result=result["markdown"],
            raw_output=result["raw_output"],
            status="completed",
            duration=result["duration_seconds"]
        )
        return {
            "success": True,
            "page": updated
        }
    else:
        doc_manager.update_page_ocr(
            doc_id=doc_id,
            page_num=page_num,
            ocr_result="",
            raw_output="",
            status="error",
            duration=result["duration_seconds"],
            error_message=result["error"]
        )
        return {
            "success": False,
            "error": result["error"],
            "page": doc_manager.get_page(doc_id, page_num)
        }

@app.post("/api/document/{doc_id}/page/{page_num}/save-edit")
async def save_page_edit(
    doc_id: str,
    page_num: int,
    req: PageEditRequest
):
    """Salva le modifiche manuali apportate dall'utente al markdown della pagina."""
    page = doc_manager.get_page(doc_id, page_num)
    if not page:
        raise HTTPException(status_code=404, detail="Pagina non trovata")

    page["ocr_result"] = req.markdown
    return {"success": True, "page": page}

@app.get("/api/document/{doc_id}/ocr-all")
async def process_all_pages_stream(
    doc_id: str,
    prompt: Optional[str] = "Text Recognition:",
    model: Optional[str] = None
):
    """Elabora tutte le pagine in streaming via Server-Sent Events (SSE) con token progressivi."""
    doc = doc_manager.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    async def event_generator():
        pages = doc["pages"]
        total = len(pages)
        
        for idx, page in enumerate(pages):
            p_num = page["page_num"]
            yield f"data: {json.dumps({'type': 'page_start', 'page_num': p_num, 'total': total})}\n\n"
            
            img_path = Path(page["file_path"])
            doc_manager.set_page_status(doc_id, p_num, PageStatus.PROCESSING)
            
            async for chunk in ocr_engine.recognize_image_stream(
                image_path=img_path,
                prompt=prompt or "Text Recognition:",
                model=model
            ):
                if chunk["type"] == "token":
                    yield f"data: {json.dumps({'type': 'page_token', 'page_num': p_num, 'token': chunk['token']})}\n\n"
                elif chunk["type"] == "done":
                    updated = doc_manager.update_page_ocr(
                        doc_id=doc_id,
                        page_num=p_num,
                        ocr_result=chunk["markdown"],
                        raw_output=chunk["raw_output"],
                        status="completed",
                        duration=chunk["duration_seconds"]
                    )
                    yield f"data: {json.dumps({'type': 'page_completed', 'page': updated, 'total': total})}\n\n"
                elif chunk["type"] == "error":
                    updated = doc_manager.update_page_ocr(
                        doc_id=doc_id,
                        page_num=p_num,
                        ocr_result="",
                        raw_output="",
                        status="error",
                        duration=chunk.get("duration_seconds", 0.0),
                        error_message=chunk["error"]
                    )
                    yield f"data: {json.dumps({'type': 'page_error', 'page': updated, 'error': chunk['error'], 'total': total})}\n\n"

        yield f"data: {json.dumps({'type': 'all_finished', 'total': total})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/api/document/{doc_id}/export")
async def export_document_markdown(doc_id: str):
    """Scarica il markdown completo consolidato."""
    doc = doc_manager.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    md_content = doc_manager.get_consolidated_markdown(doc_id)
    safe_filename = Path(doc["filename"]).stem + "_ocr.md"

    return PlainTextResponse(
        content=md_content,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"'
        }
    )

@app.delete("/api/document/{doc_id}")
async def delete_document_endpoint(doc_id: str):
    """Elimina i dati e i file temporanei relativi al documento."""
    deleted = doc_manager.delete_document(doc_id)
    return {"success": True, "deleted": deleted}

@app.post("/api/cleanup")
async def cleanup_all_temp():
    """Svuota completamente tutti i documenti e i file temporanei generati."""
    doc_manager.clear_all()
    return {"success": True, "message": "Cartella temporanea svuotata"}

# Static files & SPA
static_dir = BASE_DIR / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def root_index():
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return PlainTextResponse("GLM-OCR Studio - Caricamento frontend...")
