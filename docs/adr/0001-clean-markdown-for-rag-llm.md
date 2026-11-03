# 0001. Clean Markdown for RAG and LLMs over Visual Typographic Replication

## Status
Accepted

## Context
Scanned documents and academic PDFs often exhibit visual typographic conventions (for instance, tables where maximum values are printed in bold and second-highest values are underlined). A consideration arose regarding whether to replicate exact visual typography inside numeric table cells (via `**value**` or `<u>value</u>`), either by adopting larger external models (e.g., Baidu Unlimited-OCR 3.3B) or by introducing complex vector font extraction heuristics.

## Decision
We maintain the core architectural goal of **GLM-OCR Studio** to produce standard, interoperable **Clean Markdown** (CommonMark / GFM), optimized for ingestion into RAG pipelines, vector stores, and Large Language Models (LLMs), without heavyweight external dependencies, unverified models, or brittle computer-vision typography heuristics.

## Consequences & Rationales
1. **RAG / LLM Priority vs Typography**: In numeric tables fed into language models, tabular parsers, and data pipelines, arbitrary HTML tags (`<u>`, `<b>`) or markdown emphasis asterisks (`**`) inside numerical values introduce noise that degrades retrieval, schema validation, and type-casting (`float`, `int`).
2. **KISS & Zero External Dependencies**: The system relies strictly on a local Ollama instance running the official `glm-ocr:latest` model (0.9B, compact, fast, and resource-efficient on local GPUs), without requiring dedicated Linux environments, Docker/vLLM containers, or custom server runtimes.
3. **Universal Compatibility (PDF & Images)**: Font-based heuristics do not apply to raster images (PNG, JPG, scanned paper). The VLM must operate uniformly and deterministically across all visual inputs.
4. **Integrated Dual Editor for Human Review**: When human visual emphasis is needed, the integrated side-by-side Markdown editor allows immediate manual touch-ups with live KaTeX and GFM rendering.
