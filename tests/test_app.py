import io
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    print("Health check data:", data)
    assert "online" in data

def test_config():
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "prompts" in data
    assert "text" in data["prompts"]

def test_upload_and_pipeline():
    # 1. Create test image
    img = Image.new('RGB', (400, 150), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((20, 20), "# Invoice N. 450", fill=(0, 0, 0))
    d.text((20, 50), "| Prodotto | Prezzo |", fill=(0, 0, 0))
    d.text((20, 70), "| Monitor | 199 EUR |", fill=(0, 0, 0))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    # 2. Upload
    response = client.post(
        "/api/upload",
        files={"file": ("test_doc.png", buf, "image/png")},
        data={"dpi": 200}
    )
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    doc = res_data["document"]
    doc_id = doc["doc_id"]
    assert doc["total_pages"] == 1
    print(f"Document uploaded successfully with doc_id: {doc_id}")

    # 3. Get page image
    img_resp = client.get(f"/api/document/{doc_id}/page/1/image")
    assert img_resp.status_code == 200
    assert img_resp.headers["content-type"] == "image/png"
    assert len(img_resp.content) > 0
    print("Page image retrieved successfully, byte size:", len(img_resp.content))

    # 4. OCR on page
    ocr_resp = client.post(
        f"/api/document/{doc_id}/page/1/ocr",
        json={"prompt": "Text Recognition:"}
    )
    assert ocr_resp.status_code == 200
    ocr_data = ocr_resp.json()
    print("OCR response:", ocr_data)
    assert ocr_data["success"] is True
    page = ocr_data["page"]
    assert "Invoice" in page["ocr_result"]
    print("OCR Markdown result:\n", page["ocr_result"])

    # 5. Export document
    export_resp = client.get(f"/api/document/{doc_id}/export")
    assert export_resp.status_code == 200
    assert "Invoice" in export_resp.text
    print("Export verified successfully!")

if __name__ == "__main__":
    print("Running GLM-OCR Studio test suite...")
    test_health()
    test_config()
    test_upload_and_pipeline()
    print("ALL TESTS PASSED SUCCESSFULLY!")
