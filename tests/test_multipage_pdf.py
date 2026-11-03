import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymupdf as fitz
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_multipage_pdf():
    # 1. Create a 2-page PDF in memory using pymupdf
    doc = fitz.open()
    
    # Page 1
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((50, 80), "Page 1: Zeppelin OCR Overview", fontsize=18)
    p1.insert_text((50, 120), "This is the first page of our multi-page test document.", fontsize=12)

    # Page 2
    p2 = doc.new_page(width=595, height=842)
    p2.insert_text((50, 80), "Page 2: Specifications Table", fontsize=18)
    p2.insert_text((50, 120), "Item: Model GLM-OCR", fontsize=12)
    p2.insert_text((50, 140), "Host: Ollama Local", fontsize=12)

    pdf_bytes = doc.tobytes()
    doc.close()

    # 2. Upload PDF to server
    res = client.post(
        "/api/upload",
        files={"file": ("multipage_sample.pdf", pdf_bytes, "application/pdf")},
        data={"dpi": 150}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    document = data["document"]
    assert document["total_pages"] == 2
    doc_id = document["doc_id"]
    print(f"Multi-page PDF uploaded: {document['filename']}, {document['total_pages']} pages, doc_id: {doc_id}")

    # 3. Verify images generated for both pages
    for p_num in (1, 2):
        img_res = client.get(f"/api/document/{doc_id}/page/{p_num}/image")
        assert img_res.status_code == 200
        assert len(img_res.content) > 1000
        print(f"Page {p_num} image size: {len(img_res.content)} bytes")

    print("Multi-page PDF test passed successfully!")

if __name__ == "__main__":
    test_multipage_pdf()
