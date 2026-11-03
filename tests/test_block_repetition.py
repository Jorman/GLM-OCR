import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ocr_engine import OcrEngine
import pytest

def test_clean_markdown_strips_duplicate_paragraphs():
    """Verifica che se un paragrafo di testo si ripete identico, clean_markdown_output mantenga solo la prima occorrenza."""
    block = "Industrial Ventilation: A Manual of Recommended Practice\n23rd Edition\n1998\nAmerican Conference"
    filler = "\n\nI will output this as requested.\n\n"
    raw_repeated = block + filler + block + filler + block

    cleaned = OcrEngine.clean_markdown_output(raw_repeated)
    assert cleaned.count("Industrial Ventilation: A Manual of Recommended Practice") == 1
    assert "I will output this as requested" not in cleaned

def test_clean_markdown_removes_conversational_filler():
    """Verifica la rimozione di frasi conversazionali tipiche dei loop LLM."""
    text_with_filler = "Title Page\nWait, let me re-read the last line.\nSome Content\nI will output this as requested."
    cleaned = OcrEngine.clean_markdown_output(text_with_filler)
    assert "Wait, let me re-read" not in cleaned
    assert "I will output this as requested" not in cleaned
    assert "Title Page" in cleaned
    assert "Some Content" in cleaned
