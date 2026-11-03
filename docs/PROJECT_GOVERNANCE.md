# Project Governance & Development Workflow

This document sets binding guidelines for all agents, contributors, and automated tooling working on this repository.

---

## 1. Primary Language & Communication
- **English Only**: All codebase documentation (`README.md`, specs, Architecture Decision Records, comments, docstrings, commit messages, PR descriptions, and issue tickets) must be maintained strictly in **English**.
- **No Translation Drift**: Never mix Italian or other languages into git commits or documentation files.

---

## 2. Git Author & Identity Governance
- **Git Author Name**: Always `Jorman`.
- **Git Author Email**: `jorman@users.noreply.github.com`.
- **Strict Anonymity Rule**: Never use or expose real full names, corporate hostnames, internal domain names, or work email addresses (`@zeppelin.com`, etc.) in commits, commit messages, configurations, or repository files.
- **Git Step Separation**: Execute git steps sequentially (e.g. stage, commit, push) and never combine commands with `&&`.

---

## 3. Strict Ignore & Data Protection Rules
- **No Test / Scanned Documents in Version Control**:
  - Never track or commit user PDF files, scanned images (`.png`, `.jpg`, `.jpeg`, `.tiff`, `.bmp`, `.webp`), or any test documents intended for OCR processing.
  - Exception: Only static UI design assets located inside `static/` are permitted.
- **No Binaries or Build Artifacts**:
  - Never commit `build/`, `dist/`, `.spec` files, PyInstaller executables, or python wheels/eggs.
- **Context Optimization**:
  - Maintain synchronization between [`.gitignore`](file:///c:/Users/franzinij/OneDrive%20-%20Zeppelin%20GmbH/Dokumente/GLM-OCR/.gitignore) and [`.antigravityignore`](file:///c:/Users/franzinij/OneDrive%20-%20Zeppelin%20GmbH/Dokumente/GLM-OCR/.antigravityignore) to prevent AI context bloat and token waste.

---

## 4. Ollama & GLM-OCR Model Lifecycle
- **Model Target**: Official `glm-ocr:latest` model on local Ollama (`http://localhost:11434`).
- **Automatic Model Sync**:
  - The launch script ([`run.bat`](file:///c:/Users/franzinij/OneDrive%20-%20Zeppelin%20GmbH/Dokumente/GLM-OCR/run.bat) / [`run.py`](file:///c:/Users/franzinij/OneDrive%20-%20Zeppelin%20GmbH/Dokumente/GLM-OCR/run.py)) must verify that Ollama is reachable and ensure `glm-ocr:latest` is present and up to date.
  - Build scripts ([`build_exe.bat`](file:///c:/Users/franzinij/OneDrive%20-%20Zeppelin%20GmbH/Dokumente/GLM-OCR/build_exe.bat)) verify model availability before packaging.
- **Inference Stability Safeguards**:
  - All inference requests must enforce:
    - `repeat_penalty: 1.25`
    - `temperature: 0.1`
    - Stop tokens: `["```markdown", "```text", "<|endoftext|>"]`
  - This eliminates infinite repetition loops observed with VLM architectures.
