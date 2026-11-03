# GLM-OCR Studio

High-performance local web application for optical character recognition (OCR) of multi-page PDF documents and images into clean, structured Markdown. Built specifically for RAG (Retrieval-Augmented Generation) pipelines, vector search, and Large Language Models (LLMs), powered by the open-source **GLM-OCR** vision-language model running locally on **Ollama**.

---

## 🚀 Quick Start

### Method 1: Double-click with `run.bat` (Recommended on Windows)
Simply double-click [`run.bat`](file:///c:/Users/franzinij/OneDrive%20-%20Zeppelin%20GmbH/Dokumente/GLM-OCR/run.bat):
1. Verifies Python availability.
2. Checks that local Ollama service (`http://localhost:11434`) is running.
3. Checks port availability (default `8000`), automatically assigning an alternative port if busy.
4. Starts the **Uvicorn** server.
5. Automatically opens **Microsoft Edge** pointing to `http://127.0.0.1:8000`.

### Method 2: Command Line
```powershell
# Run the startup script directly
python run.py
```

---

## 🌟 Key Features

- **Split-Screen Dual Viewer**:
  - **Left Pane**: Document viewer with high-resolution page-by-page display (configurable DPI: 150/200/300), 90° rotation, zoom controls, and thumbnail/keyboard navigation (left/right arrows).
  - **Right Pane**: Real-time OCR result with instant view mode toggling:
    - **Formatted**: Rich preview with GitHub Flavored Markdown tables, KaTeX mathematical formulas (`$...$` and `$$...$$`), and clean lists.
    - **Raw Markdown**: Monospace code editor allowing instant manual edits before export.
    - **Side-by-Side**: Simultaneous dual editor and live-rendered preview with auto-sync scrolling.
- **Multi-Page PDF & Image Support**:
  - Automatic conversion of PDF pages into high-resolution PNG images via PyMuPDF.
  - Page-by-page OCR or batch processing of the entire document with real-time SSE (Server-Sent Events) progress streaming.
  - Single-page cancellation support without breaking session state.
- **GLM-OCR Task Presets**:
  - `Text Recognition:` General document text, receipts, letters, and prose.
  - `Table Recognition:` Complex structured tables and spreadsheets extracted into clean Markdown pipe tables.
  - `Formula Recognition:` Mathematical, physical, and scientific equations extracted into LaTeX notation.
  - `Custom Prompt:` Custom system/user prompts or JSON extraction schemas.
- **Anti-Repetition & Anti-Looping Engine**:
  - Pre-tuned inference parameters and verified stop sequences (`stop: ["```markdown", "```text", "<|endoftext|>"]`, `repeat_penalty: 1.25`, `temperature: 0.1`) eliminating infinite looping behaviors common in VLM architectures on Ollama.
- **Export Capabilities**:
  - One-click copy to clipboard.
  - Download individual page `.md` or consolidated multi-page document with clean page boundary delimiters (`--- <!-- Page N --> ---`).

---

## 📁 Project Structure

```
GLM-OCR/
├── app/
│   ├── __init__.py          # Package initialization
│   ├── config.py            # Configuration defaults, DPI, stop tokens, prompts
│   ├── ocr_engine.py        # Ollama client with SSE stream & output sanitization
│   ├── pdf_converter.py     # PDF & image rasterization (PyMuPDF)
│   ├── document_manager.py  # Session document lifecycle & aggregated exports
│   └── main.py              # FastAPI server, REST routes, SSE endpoints
├── static/
│   ├── index.html           # Responsive split-view UI
│   ├── css/
│   │   └── style.css        # Dark theme stylesheet & refined layout rules
│   └── js/
│       └── app.js           # Client-side logic (upload, zoom, sync, rendering)
├── tests/
│   ├── test_app.py          # End-to-end backend test suite
│   ├── test_convert_stream.py # SSE conversion stream verification
│   └── test_multipage_pdf.py# Multi-page PDF conversion tests
├── docs/
│   └── adr/                 # Architecture Decision Records
│       └── 0001-clean-markdown-for-rag-llm.md
├── run.py                   # Server starter, port checker, browser launcher
├── run.bat                  # One-click Windows batch launcher
├── build_exe.bat            # PyInstaller packaging script
├── requirements.txt         # Python dependencies
├── .gitignore               # GitHub-aligned ignore rules (no PDFs/images/binaries)
└── .antigravityignore       # AI agent context-optimization ignore rules
```

---

## 🛠️ Prerequisites

- **Python 3.10+**
- **Ollama** installed with `glm-ocr` model pulled:
  ```bash
  ollama pull glm-ocr:latest
  ```

---

## 🛡️ License & Acknowledgements

Created and maintained by **Jorman**.
Powered by [GLM-OCR](https://github.com/THUDM/GLM-4) and [Ollama](https://ollama.ai).
