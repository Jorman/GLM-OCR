import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ocr_engine import OcrEngine
from app.config import PROMPT_PRESETS

def test_clean_markdown_for_rag_and_llm():
    """Verifica che l'output OCR sia pulito, privo di token speciali e ottimizzato per RAG/LLM."""
    engine = OcrEngine()
    sample_text = (
        "```markdown\n"
        "Table 1 | Comparison of models\n\n"
        "| Benchmark (Metric) | DeepSeek-V3.2 | DeepSeek-V4-Flash | DeepSeek-V4-Pro |\n"
        "| :--- | :--- | :--- | :--- |\n"
        "| AGIEval (EM) | 80.1 | 82.6 | 83.1 |\n"
        "| MMLU (EM) | 87.8 | 88.7 | 90.1 |\n\n"
        "Formula: $$E = mc^2$$\n"
        "<|endoftext|>\n"
        "```"
    )
    cleaned = engine.clean_markdown_output(sample_text)
    # 1. Outer fences and special tokens must be cleaned
    assert not cleaned.startswith("```markdown"), "Markdown codeblock delimiter should be stripped"
    assert not cleaned.endswith("```"), "Trailing codeblock delimiter should be stripped"
    assert "<|endoftext|>" not in cleaned, "Special tokens must be stripped"

    # 2. Table data values must be clean primitives (integers/floats readable by RAG/LLM without parsing errors)
    assert "| AGIEval (EM) | 80.1 | 82.6 | 83.1 |" in cleaned
    assert "| MMLU (EM) | 87.8 | 88.7 | 90.1 |" in cleaned

    # 3. Math formulas must be preserved for LLM semantic understanding
    assert "$$E = mc^2$$" in cleaned
    print("test_clean_markdown_for_rag_and_llm: PASSED")

def test_official_prompt_presets():
    """Verifica i preset ufficiali di GLM-OCR per le diverse tipologie di estrazione."""
    assert "text" in PROMPT_PRESETS
    assert "table" in PROMPT_PRESETS
    assert "formula" in PROMPT_PRESETS
    assert "custom" in PROMPT_PRESETS
    print("test_official_prompt_presets: PASSED")

if __name__ == "__main__":
    print("Running RAG/LLM Clean Markdown Tests...")
    test_clean_markdown_for_rag_and_llm()
    test_official_prompt_presets()
    print("ALL CLEAN MARKDOWN TESTS PASSED!")
