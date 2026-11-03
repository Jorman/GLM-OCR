import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_stream_page3():
    # Use existing document folder if present
    temp_dir = Path(r"c:\Users\franzinij\OneDrive - Zeppelin GmbH\Dokumente\GLM-OCR\storage\temp\1cddd47c-539b-4bb5-aae8-e5bede322852")
    if not temp_dir.exists():
        print("User document temp dir not found, skipping stream test on page 3")
        return

    doc_id = "1cddd47c-539b-4bb5-aae8-e5bede322852"
    # Re-register document in doc_manager for this test process
    from app.main import doc_manager
    from app.pdf_converter import convert_document_to_pages
    
    upload_file = temp_dir / "Il calcolo dello sviluppo.pdf"
    pages_dir = temp_dir / "pages"
    pages_meta = convert_document_to_pages(upload_file, pages_dir, dpi=150)
    
    doc_manager.documents[doc_id] = {
        "doc_id": doc_id,
        "filename": "Il calcolo dello sviluppo.pdf",
        "created_at": 0,
        "total_pages": len(pages_meta),
        "dpi": 150,
        "pages": pages_meta
    }

    # Test SSE stream endpoint on page 3
    with client.stream("GET", f"/api/document/{doc_id}/page/3/ocr-stream") as response:
        assert response.status_code == 200
        token_count = 0
        done_received = False
        full_text = ""
        for line in response.iter_lines():
            if line and line.startswith("data: "):
                data = json.loads(line[6:])
                if data["type"] == "token":
                    token_count += 1
                    full_text += data["token"]
                elif data["type"] == "done":
                    done_received = True
                    print(f"\nStream completed! Received {token_count} tokens.")
                    print("First 150 chars:", full_text[:150])
                    print("Last 150 chars:", full_text[-150:])
                    break

        assert token_count > 10, "Should have received multiple tokens"
        assert done_received, "Should have received done event"
        assert "Emiliano Corrieri" in full_text, "Full page text should include the author's signature at the end"
        print("STREAMING TEST PASSED WITH COMPLETE PAGE EXTRACTION!")

if __name__ == "__main__":
    test_stream_page3()
