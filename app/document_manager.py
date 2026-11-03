import uuid
import shutil
import time
from pathlib import Path
from typing import Dict, Any, Optional, List, Union

from app.config import TEMP_DIR, DEFAULT_DPI, PageStatus
from app.pdf_converter import convert_document_to_pages, get_document_page_count

class DocumentManager:
    def __init__(self, storage_dir: Path = TEMP_DIR):
        self.storage_dir = storage_dir
        self.documents: Dict[str, Dict[str, Any]] = {}

    def create_document_initial(
        self,
        file_bytes: bytes,
        original_filename: str,
        dpi: int = DEFAULT_DPI
    ) -> Dict[str, Any]:
        """Salva il file caricato e inizializza la sessione con il conteggio pagine istantaneo."""
        doc_id = str(uuid.uuid4())
        doc_dir = self.storage_dir / doc_id
        doc_dir.mkdir(parents=True, exist_ok=True)

        upload_path = doc_dir / original_filename
        with open(upload_path, "wb") as f:
            f.write(file_bytes)

        total_pages = get_document_page_count(upload_path)

        doc_data = {
            "doc_id": doc_id,
            "filename": original_filename,
            "file_path": str(upload_path),
            "created_at": time.time(),
            "total_pages": total_pages,
            "dpi": dpi,
            "pages": [],
            "status": "converting"
        }

        self.documents[doc_id] = doc_data
        return doc_data

    def finalize_document_pages(
        self,
        doc_id: str,
        pages_meta: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """Assegna le pagine renderizzate e finalizza lo stato del documento."""
        doc = self.get_document(doc_id)
        if not doc:
            return None
        doc["pages"] = pages_meta
        doc["total_pages"] = len(pages_meta)
        doc["status"] = "ready"
        return doc

    def create_document_from_upload(
        self,
        file_bytes: bytes,
        original_filename: str,
        dpi: int = DEFAULT_DPI
    ) -> Dict[str, Any]:
        """
        Salva il file caricato, lo converte in pagine e registra la sessione del documento in modo sincrono.
        """
        doc_data = self.create_document_initial(file_bytes, original_filename, dpi=dpi)
        doc_id = doc_data["doc_id"]
        doc_dir = self.storage_dir / doc_id
        upload_path = Path(doc_data["file_path"])
        pages_dir = doc_dir / "pages"
        pages_meta = convert_document_to_pages(upload_path, pages_dir, dpi=dpi)
        self.finalize_document_pages(doc_id, pages_meta)
        return doc_data

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        return self.documents.get(doc_id)

    def get_page(self, doc_id: str, page_num: int) -> Optional[Dict[str, Any]]:
        doc = self.get_document(doc_id)
        if not doc:
            return None
        for p in doc["pages"]:
            if p["page_num"] == page_num:
                return p
        return None

    def set_page_status(
        self,
        doc_id: str,
        page_num: int,
        status: Union[PageStatus, str],
        error_message: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Aggiorna in modo incapsulato lo stato e l'eventuale errore di una pagina."""
        page = self.get_page(doc_id, page_num)
        if not page:
            return None
        page["ocr_status"] = status.value if isinstance(status, PageStatus) else str(status)
        if error_message is not None:
            page["error_message"] = error_message
        return page

    def update_page_ocr(
        self,
        doc_id: str,
        page_num: int,
        ocr_result: str,
        raw_output: str,
        status: Union[PageStatus, str] = PageStatus.COMPLETED,
        duration: Optional[float] = None,
        error_message: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        page = self.get_page(doc_id, page_num)
        if not page:
            return None

        status_val = status.value if isinstance(status, PageStatus) else str(status)
        page["ocr_result"] = ocr_result
        page["raw_output"] = raw_output
        page["ocr_status"] = status_val
        page["ocr_duration"] = duration
        page["error_message"] = error_message
        return page

    def get_consolidated_markdown(self, doc_id: str) -> str:
        doc = self.get_document(doc_id)
        if not doc:
            return ""

        parts = []
        total = doc["total_pages"]
        for p in doc["pages"]:
            num = p["page_num"]
            md = p.get("ocr_result") or ""
            if total > 1:
                parts.append(f"<!-- Page {num} -->\n\n{md}\n\n---\n")
            else:
                parts.append(f"{md}\n")

        return "\n".join(parts).strip()

    def delete_document(self, doc_id: str) -> bool:
        doc_dir = self.storage_dir / doc_id
        if doc_dir.exists():
            shutil.rmtree(doc_dir, ignore_errors=True)

        if doc_id in self.documents:
            del self.documents[doc_id]
            return True
        return False

    def clear_all(self):
        """Cancella tutti i documenti in memoria e svuota la cartella temporanea."""
        self.documents.clear()
        if self.storage_dir.exists():
            for item in self.storage_dir.iterdir():
                try:
                    if item.is_dir():
                        shutil.rmtree(item, ignore_errors=True)
                    else:
                        item.unlink(missing_ok=True)
                except Exception:
                    pass
