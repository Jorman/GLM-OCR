import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.config import PageStatus, MAX_UPLOAD_SIZE_MB
from app.document_manager import DocumentManager

client = TestClient(app)

def test_page_status_enum():
    assert PageStatus.PENDING == "pending"
    assert PageStatus.PROCESSING == "processing"
    assert PageStatus.COMPLETED == "completed"
    assert PageStatus.ERROR == "error"

def test_document_manager_set_page_status(tmp_path):
    mgr = DocumentManager(storage_dir=tmp_path)
    
    # Crea un fake doc in mgr
    mgr.documents["doc-123"] = {
        "doc_id": "doc-123",
        "filename": "sample.pdf",
        "total_pages": 1,
        "pages": [
            {
                "page_num": 1,
                "ocr_status": PageStatus.PENDING.value,
                "ocr_result": None,
                "error_message": None
            }
        ]
    }

    # Test cambio a processing via Enum
    updated = mgr.set_page_status("doc-123", 1, PageStatus.PROCESSING)
    assert updated is not None
    assert updated["ocr_status"] == "processing"

    # Test cambio a error con messaggio
    updated_err = mgr.set_page_status("doc-123", 1, PageStatus.ERROR, error_message="Simulated error")
    assert updated_err["ocr_status"] == "error"
    assert updated_err["error_message"] == "Simulated error"

    # Test update_page_ocr con enum
    updated_ocr = mgr.update_page_ocr(
        doc_id="doc-123",
        page_num=1,
        ocr_result="# Success",
        raw_output="# Success",
        status=PageStatus.COMPLETED,
        duration=1.23
    )
    assert updated_ocr["ocr_status"] == "completed"
    assert updated_ocr["ocr_result"] == "# Success"
    assert updated_ocr["ocr_duration"] == 1.23

def test_upload_size_limit_rejection():
    # Creiamo un payload fittizio che supera MAX_UPLOAD_SIZE_MB
    # Simuliamo un payload leggermente superiore al limite consentito
    fake_oversized = b"0" * ((MAX_UPLOAD_SIZE_MB * 1024 * 1024) + 1024)
    files = {"file": ("huge_file.pdf", fake_oversized, "application/pdf")}
    res = client.post("/api/upload", files=files, data={"dpi": "150"})
    assert res.status_code == 413
    data = res.json()
    assert "supera la dimensione massima" in data["detail"]

if __name__ == "__main__":
    test_page_status_enum()
    print("Page status enum test: OK")
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as td:
        test_document_manager_set_page_status(Path(td))
    print("Document manager status test: OK")
    test_upload_size_limit_rejection()
    print("Upload size limit test: OK")
    print("\nTUTTI I TEST DELLE CORREZIONI SUPERATI CON SUCCESSO!")
