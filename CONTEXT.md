# GLM-OCR Studio - Domain Specifications & Context

Local high-performance application for OCR extraction of multi-page PDF documents and images into clean, structured Markdown, optimized for RAG (Retrieval-Augmented Generation) pipelines and Large Language Models (LLMs), powered by the open-source GLM-OCR model executed locally via Ollama.

## Ubiquitous Language & Domain Terms

**Clean Markdown**:
Text formatted strictly according to the CommonMark / GitHub Flavored Markdown (GFM) standard, containing structured data (pipe-delimited column tables, LaTeX formulas, semantic headers) and free from arbitrary typographic noise (such as asterisks or underline tags embedded within numeric table cells) that would obstruct automated parsing, retrieval, or mathematical type-casting in LLM / RAG pipelines.
_Avoid_: Visual typography, decorative rich-text, redundant HTML markup.

**Document**:
A multi-page PDF or a single image (PNG, JPG, TIFF) uploaded by the user and registered within the application session with a unique identifier (`doc_id`).
_Avoid_: Source file, generic upload.

**Page**:
A single page of a Document, rasterized and cached as a high-resolution image (configurable DPI) for processing and visual review in the left pane.
_Avoid_: Frame, slide, sheet.

**OCR Extraction**:
The visual inference and streaming process executed by the GLM-OCR model on Ollama that converts the graphical representation of a page into structured Markdown text.
_Avoid_: Simple scanning, digitization.

**Prompt Preset**:
A standardized inference instruction for GLM-OCR (General Text Recognition, Structured Tables, Mathematical Formulas) guiding the semantic output structure.
_Avoid_: Visual mode, theme, skin.
