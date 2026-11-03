import sys
import json
import io
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw
import pymupdf as fitz
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_async_upload_and_convert_stream():
    """Verifica il flusso a due fasi: upload asincrono e stream SSE del progresso di conversione."""
    # 1. Crea un PDF di test con 3 pagine in memoria
    doc = fitz.open()
    for i in range(3):
        page = doc.new_page(width=300, height=300)
        page.insert_text((50, 50), f"Page {i+1} Test Content", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()

    # 2. Upload con async_convert=true
    resp = client.post(
        "/api/upload",
        files={"file": ("multipage_test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        data={"dpi": 150, "async_convert": "true"}
    )
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["success"] is True
    doc_info = res_data["document"]
    doc_id = doc_info["doc_id"]
    assert doc_info["total_pages"] == 3

    # 3. Stream SSE del progresso di conversione
    with client.stream("GET", f"/api/document/{doc_id}/convert-stream?dpi=150") as stream_resp:
        assert stream_resp.status_code == 200
        progress_events = []
        completed_event = None
        for line in stream_resp.iter_lines():
            if line and line.startswith("data: "):
                event_data = json.loads(line[6:])
                if event_data.get("type") == "progress":
                    progress_events.append(event_data)
                elif event_data.get("type") == "completed":
                    completed_event = event_data
                    break

        assert len(progress_events) == 3, f"Expected 3 progress events, got {len(progress_events)}"
        assert progress_events[0]["current"] == 1
        assert progress_events[-1]["current"] == 3
        assert completed_event is not None
        assert completed_event["document"]["total_pages"] == 3
        assert len(completed_event["document"]["pages"]) == 3

    # 4. Verifica che la pagina 1 sia ora disponibile e scaricabile
    page1_resp = client.get(f"/api/document/{doc_id}/page/1/image")
    assert page1_resp.status_code == 200
    assert page1_resp.headers["content-type"] == "image/png"
