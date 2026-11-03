import sys
from pathlib import Path
from PIL import Image, ImageDraw

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import DEFAULT_TEMPERATURE, DEFAULT_OPTIONS, DEFAULT_CONFIG
from app.ocr_engine import OcrEngine, is_blank_image
import pytest

def test_default_temperature_is_zero():
    """Verifica che la temperatura predefinita sia 0.0 (Greedy Decoding) come da Modelfile GLM-OCR."""
    assert DEFAULT_TEMPERATURE == 0.0
    assert DEFAULT_CONFIG["temperature"] == 0.0

def test_default_inference_options():
    """Verifica che le opzioni predefinite proteggano contro i loop di ripetizione."""
    assert DEFAULT_OPTIONS["temperature"] == 0.0
    assert DEFAULT_OPTIONS["repeat_penalty"] >= 1.15
    assert DEFAULT_OPTIONS["repeat_last_n"] >= 256

def test_is_blank_image_detection(tmp_path):
    """Verifica che un'immagine completamente bianca venga identificata come vuota e un'immagine con testo no."""
    # 1. Immagine 100% bianca
    blank_img = Image.new("RGB", (300, 300), color=(255, 255, 255))
    blank_file = tmp_path / "blank.png"
    blank_img.save(blank_file)

    assert is_blank_image(blank_file) is True

    # 2. Immagine con testo
    text_img = Image.new("RGB", (300, 300), color=(255, 255, 255))
    draw = ImageDraw.Draw(text_img)
    draw.text((20, 20), "Test OCR Content", fill=(0, 0, 0))
    text_file = tmp_path / "text.png"
    text_img.save(text_file)

    assert is_blank_image(text_file) is False

@pytest.mark.anyio
async def test_ocr_engine_handles_blank_image_without_ollama(tmp_path):
    """Verifica che OcrEngine gestisca istantaneamente immagini bianche restituendo '<!-- Pagina vuota -->'."""
    blank_img = Image.new("RGB", (300, 300), color=(255, 255, 255))
    blank_file = tmp_path / "blank_page.png"
    blank_img.save(blank_file)

    engine = OcrEngine()
    result = await engine.recognize_image(blank_file)

    assert result["success"] is True
    assert result["markdown"] == "<!-- Pagina vuota -->"
    assert result["duration_seconds"] < 0.5

def test_clean_markdown_collapses_degeneration_loops():
    """Verifica che la pulizia markdown collassi i loop di degenerazione estremi (es. 30x APPROVED)."""
    raw_loop = "CERTIFICATE\nAPPROVED " + ("APPROVED " * 30)
    cleaned = OcrEngine.clean_markdown_output(raw_loop)
    assert cleaned.count("APPROVED") == 1
    assert cleaned.endswith("APPROVED")

    fences_loop = "```markdown\n# Title\n```\n```\n```\n```"
    cleaned_fences = OcrEngine.clean_markdown_output(fences_loop)
    assert cleaned_fences == "# Title"
