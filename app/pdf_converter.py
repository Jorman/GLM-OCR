import os
import io
from pathlib import Path
from typing import List, Dict, Any
from PIL import Image
import pymupdf as fitz

from app.config import DEFAULT_DPI, PageStatus

def is_pdf(filename: str) -> bool:
    return filename.lower().endswith(".pdf")

def is_image(filename: str) -> bool:
    valid_exts = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif", ".bmp"}
    return Path(filename).suffix.lower() in valid_exts

def get_document_page_count(file_path: Path) -> int:
    """Restituisce il numero totale di pagine senza renderizzarle (istantaneo)."""
    filename = file_path.name
    if is_pdf(filename):
        doc = fitz.open(file_path)
        count = len(doc)
        doc.close()
        return count
    elif is_image(filename):
        return 1
    return 1

def convert_document_to_pages_stream(
    file_path: Path,
    output_dir: Path,
    dpi: int = DEFAULT_DPI
):
    """
    Converte un documento producendo aggiornamenti progressivi (generator).
    Per ogni pagina emette: { "type": "progress", "current": page_num, "total": total_pages, "percent": pct }
    Alla fine emette: { "type": "completed", "pages": pages_meta, "total_pages": total_pages }
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = file_path.name
    pages_meta = []

    if is_pdf(filename):
        doc = fitz.open(file_path)
        total_pages = len(doc)
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)

        for page_index in range(total_pages):
            page_num = page_index + 1
            page = doc.load_page(page_index)
            pix = page.get_pixmap(matrix=matrix, alpha=False)

            page_filename = f"page_{page_num}.png"
            page_path = output_dir / page_filename
            pix.save(str(page_path))

            meta = {
                "page_num": page_num,
                "filename": page_filename,
                "file_path": str(page_path),
                "width": pix.width,
                "height": pix.height,
                "ocr_result": None,
                "ocr_status": PageStatus.PENDING.value,
                "ocr_duration": None,
                "error_message": None
            }
            pages_meta.append(meta)

            pct = int((page_num / total_pages) * 100)
            yield {
                "type": "progress",
                "current": page_num,
                "total": total_pages,
                "percent": pct,
                "page": meta
            }

        doc.close()

    elif is_image(filename):
        with Image.open(file_path) as img:
            rgb_img = img.convert("RGB")
            page_filename = "page_1.png"
            page_path = output_dir / page_filename
            rgb_img.save(str(page_path), format="PNG")
            w, h = rgb_img.size

        meta = {
            "page_num": 1,
            "filename": page_filename,
            "file_path": str(page_path),
            "width": w,
            "height": h,
            "ocr_result": None,
            "ocr_status": PageStatus.PENDING.value,
            "ocr_duration": None,
            "error_message": None
        }
        pages_meta.append(meta)
        yield {
            "type": "progress",
            "current": 1,
            "total": 1,
            "percent": 100,
            "page": meta
        }
    else:
        raise ValueError(f"Formato file non supportato: {file_path.suffix}")

    yield {
        "type": "completed",
        "pages": pages_meta,
        "total_pages": len(pages_meta)
    }

def convert_document_to_pages(
    file_path: Path,
    output_dir: Path,
    dpi: int = DEFAULT_DPI
) -> List[Dict[str, Any]]:
    """
    Converte un documento (PDF o immagine) in una o più immagini PNG salvate in output_dir.
    Restituisce i metadati di ciascuna pagina.
    """
    pages = []
    for item in convert_document_to_pages_stream(file_path, output_dir, dpi):
        if item["type"] == "completed":
            pages = item["pages"]
    return pages
