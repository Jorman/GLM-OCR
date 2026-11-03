// GLM-OCR Studio Client Application v1.1.0
document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        docId: null,
        filename: null,
        totalPages: 1,
        currentPage: 1,
        pages: [],
        zoom: 1.0,
        rotation: 0,
        activeTab: 'formatted', // 'formatted' | 'raw' | 'split' | 'logs'
        autoSync: true,         // Toggle to follow pages during batch OCR
        isDraggingImage: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
        isProcessing: false,
        timerInterval: null,
        timerStartTime: null,
        settings: {
            ollamaUrl: 'http://localhost:11434',
            model: 'glm-ocr:latest',
            dpi: 200,
            temperature: 0.1
        },
        logs: []
    };

    // Live streaming shared state (used by both single page and batch streams)
    let currentlyProcessingPage = null;
    let liveAccumulatedText = '';
    let liveRenderThrottle = null;

    // Load saved settings from server (persisted in config.json) with fallback to localStorage
    async function loadServerConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const cfg = await res.json();
                if (cfg.ollama_base_url) state.settings.ollamaUrl = cfg.ollama_base_url;
                if (cfg.default_model) state.settings.model = cfg.default_model;
                if (cfg.default_dpi) state.settings.dpi = cfg.default_dpi;
                if (cfg.temperature !== undefined) state.settings.temperature = cfg.temperature;
            }
        } catch (e) {
            try {
                const saved = localStorage.getItem('glm_ocr_settings');
                if (saved) Object.assign(state.settings, JSON.parse(saved));
            } catch (err) {}
        }
    }
    loadServerConfig();

    // DOM Elements
    const elements = {
        // Status & Headers
        ollamaStatusDot: document.getElementById('ollama-status-dot'),
        ollamaStatusText: document.getElementById('ollama-status-text'),
        docTitleBadge: document.getElementById('doc-title-badge'),
        btnOpenFile: document.getElementById('btn-open-file'),
        fileInput: document.getElementById('file-input'),
        btnExportDoc: document.getElementById('btn-export-doc'),
        btnOpenSettings: document.getElementById('btn-open-settings'),
        
        // Upload
        uploadOverlay: document.getElementById('upload-overlay'),
        dropArea: document.getElementById('drop-area'),
        btnBrowseTrigger: document.getElementById('btn-browse-trigger'),

        // Viewer & Navigation
        btnPrevPage: document.getElementById('btn-prev-page'),
        btnNextPage: document.getElementById('btn-next-page'),
        inputCurrentPage: document.getElementById('input-current-page'),
        labelTotalPages: document.getElementById('label-total-pages'),
        btnZoomIn: document.getElementById('btn-zoom-in'),
        btnZoomOut: document.getElementById('btn-zoom-out'),
        btnZoomFitWidth: document.getElementById('btn-zoom-fit-width'),
        btnZoomFitHeight: document.getElementById('btn-zoom-fit-height'),
        btnRotate: document.getElementById('btn-rotate'),
        zoomLevelLabel: document.getElementById('zoom-level-label'),
        imageViewport: document.getElementById('image-viewport'),
        imageTransformContainer: document.getElementById('image-transform-container'),
        docPageImage: document.getElementById('doc-page-image'),
        imageLoadingSpinner: document.getElementById('image-loading-spinner'),
        
        // Bottom Thumbnail Strip & Auto-Sync
        thumbnailStrip: document.getElementById('thumbnail-strip'),
        btnScrollThumbsLeft: document.getElementById('btn-scroll-thumbs-left'),
        btnScrollThumbsRight: document.getElementById('btn-scroll-thumbs-right'),
        btnToggleAutosync: document.getElementById('btn-toggle-autosync'),
        autosyncLabel: document.getElementById('autosync-label'),

        // Right Studio / OCR
        tabFormatted: document.getElementById('tab-formatted'),
        tabRaw: document.getElementById('tab-raw'),
        tabSplit: document.getElementById('tab-split'),
        tabLogs: document.getElementById('tab-logs'),
        selectPromptPreset: document.getElementById('select-prompt-preset'),
        customPromptContainer: document.getElementById('custom-prompt-container'),
        inputCustomPrompt: document.getElementById('input-custom-prompt'),
        btnCopyMd: document.getElementById('btn-copy-md'),
        btnProcessPage: document.getElementById('btn-process-page'),
        btnProcessAll: document.getElementById('btn-process-all'),
        btnCancelPageOcr: document.getElementById('btn-cancel-page-ocr'),
        pageStatusBadge: document.getElementById('page-status-badge'),
        pageDurationLabel: document.getElementById('page-duration-label'),
        pageStreamingIndicator: document.getElementById('page-streaming-indicator'),
        batchProgressBox: document.getElementById('batch-progress-box'),
        batchProgressText: document.getElementById('batch-progress-text'),
        batchProgressBar: document.getElementById('batch-progress-bar'),
        btnCancelBatch: document.getElementById('btn-cancel-batch'),
        btnSaveEdit: document.getElementById('btn-save-edit'),

        // View Containers
        viewFormatted: document.getElementById('view-formatted'),
        formattedPlaceholder: document.getElementById('formatted-placeholder'),
        formattedContent: document.getElementById('formatted-content'),
        viewRaw: document.getElementById('view-raw'),
        rawEditor: document.getElementById('raw-editor'),
        viewSplit: document.getElementById('view-split'),
        rawEditorSplit: document.getElementById('raw-editor-split'),
        formattedContentSplit: document.getElementById('formatted-content-split'),
        viewLogs: document.getElementById('view-logs'),
        logTerminalOutput: document.getElementById('log-terminal-output'),
        btnCopyLogs: document.getElementById('btn-copy-logs'),
        btnClearLogs: document.getElementById('btn-clear-logs'),
        // Splitters & Resizing
        leftPane: document.getElementById('left-pane'),
        rightPane: document.getElementById('right-pane'),
        mainSplitter: document.getElementById('main-splitter'),
        splitRawPane: document.getElementById('split-raw-pane'),
        splitFormattedPane: document.getElementById('split-formatted-pane'),
        subSplitter: document.getElementById('sub-splitter'),

        // Settings Modal
        settingsModal: document.getElementById('settings-modal'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        btnTestConnection: document.getElementById('btn-test-connection'),
        connectionStatusFeedback: document.getElementById('connection-status-feedback'),
        settingOllamaUrl: document.getElementById('setting-ollama-url'),
        settingModelName: document.getElementById('setting-model-name'),
        selectInstalledModels: document.getElementById('select-installed-models'),
        modelStatusBadge: document.getElementById('model-status-badge'),
        pullModelContainer: document.getElementById('pull-model-container'),
        btnPullModel: document.getElementById('btn-pull-model'),
        pullProgressBox: document.getElementById('pull-progress-box'),
        pullProgressBar: document.getElementById('pull-progress-bar'),
        pullStatusText: document.getElementById('pull-status-text'),
        pullPercentage: document.getElementById('pull-percentage'),
        settingPdfDpi: document.getElementById('setting-pdf-dpi'),
        settingTemperature: document.getElementById('setting-temperature'),
    };

    // Logging Utility
    function addLog(level, message) {
        const time = new Date().toLocaleTimeString();
        const colors = {
            'INFO': 'text-blue-400',
            'OCR': 'text-amber-400',
            'SUCCESS': 'text-emerald-400',
            'ERROR': 'text-rose-400',
            'STREAM': 'text-cyan-400'
        };
        const color = colors[level] || 'text-slate-400';
        
        const logEntry = document.createElement('div');
        logEntry.className = 'font-mono text-[11px] leading-tight';
        logEntry.innerHTML = `<span class="text-slate-500">[${time}]</span> <span class="${color} font-bold">[${level}]</span> <span class="text-slate-200">${escapeHtml(message)}</span>`;
        elements.logTerminalOutput.appendChild(logEntry);
        elements.logTerminalOutput.scrollTop = elements.logTerminalOutput.scrollHeight;
        state.logs.push(`[${time}] [${level}] ${message}`);
    }

    elements.btnClearLogs.addEventListener('click', () => {
        elements.logTerminalOutput.innerHTML = '';
        state.logs = [];
        addLog('INFO', 'Log cancellati.');
    });

    elements.btnCopyLogs.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(state.logs.join('\n'));
            alert('Log copiati negli appunti!');
        } catch (e) {
            alert('Impossibile copiare i log.');
        }
    });

    // Initialize Lucide Icons
    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
    refreshIcons();
    addLog('INFO', 'GLM-OCR Studio inizializzato.');

    // Configure Marked.js
    if (window.marked) {
        marked.setOptions({
            gfm: true,
            breaks: true,
            headerIds: true,
        });
    }

    // Settings Modal logic & Ollama connection test
    let installedOllamaModels = [];
    let activePullSource = null;

    // Modelli ufficiali supportati da Ollama per GLM-OCR
    const OFFICIAL_GLM_MODELS = [
        { id: "glm-ocr:latest", label: "glm-ocr:latest (Ufficiale - Consigliato)" },
        { id: "glm-ocr:q8_0", label: "glm-ocr:q8_0 (Ufficiale - Quantizzato 8-bit)" }
    ];

    function openSettingsModal() {
        elements.settingsModal.classList.remove('hidden');
        elements.settingOllamaUrl.value = state.settings.ollamaUrl;
        elements.settingModelName.value = state.settings.model;
        elements.selectInstalledModels.value = state.settings.model;
        elements.settingPdfDpi.value = state.settings.dpi;
        elements.settingTemperature.value = state.settings.temperature;
        runConnectionTest();
    }

    // Check Ollama Health & Model Availability
    let initialHealthChecked = false;
    async function checkOllamaHealth() {
        try {
            const res = await fetch(`/api/health?url=${encodeURIComponent(state.settings.ollamaUrl)}&model=${encodeURIComponent(state.settings.model)}`);
            const data = await res.json();
            if (data.online) {
                if (data.has_requested_model) {
                    elements.ollamaStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
                    elements.ollamaStatusText.textContent = `Ollama Connesso (${data.current_model || 'glm-ocr'})`;
                    elements.ollamaStatusText.className = 'text-emerald-400 font-medium';
                } else {
                    // Ollama online ma modello non presente: avviso e rimando a impostazioni
                    elements.ollamaStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
                    elements.ollamaStatusText.textContent = `Modello non presente (${data.current_model})`;
                    elements.ollamaStatusText.className = 'text-amber-400 font-medium';
                    addLog('WARN', `Il modello ufficiale ${data.current_model} non è presente sul server. Apertura impostazioni...`);
                    if (!initialHealthChecked) {
                        openSettingsModal();
                    }
                }
            } else {
                elements.ollamaStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
                elements.ollamaStatusText.textContent = 'Ollama Non Connesso';
                elements.ollamaStatusText.className = 'text-rose-400 font-medium';
                addLog('ERROR', `Ollama non raggiungibile: ${data.error || 'connessione rifiutata'}`);
                if (!initialHealthChecked) {
                    openSettingsModal();
                }
            }
            initialHealthChecked = true;
        } catch (err) {
            elements.ollamaStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
            elements.ollamaStatusText.textContent = 'Servizio non raggiungibile';
            elements.ollamaStatusText.className = 'text-rose-400 font-medium';
            if (!initialHealthChecked) {
                openSettingsModal();
                initialHealthChecked = true;
            }
        }
    }
    checkOllamaHealth();
    setInterval(checkOllamaHealth, 15000);

    // Auto-Sync Toggle
    elements.btnToggleAutosync.addEventListener('click', () => {
        state.autoSync = !state.autoSync;
        if (state.autoSync) {
            elements.btnToggleAutosync.className = 'ml-2 flex items-center space-x-1.5 px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-medium shrink-0 transition';
            elements.autosyncLabel.textContent = 'Auto-Sync: ON';
            addLog('INFO', 'Auto-Sync attivato: la vista seguirà le pagine durante l\'elaborazione batch.');
            if (state.isProcessing && currentlyProcessingPage && state.currentPage !== currentlyProcessingPage) {
                loadPage(currentlyProcessingPage);
            }
        } else {
            elements.btnToggleAutosync.className = 'ml-2 flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium shrink-0 transition';
            elements.autosyncLabel.textContent = 'Auto-Sync: OFF';
            addLog('INFO', 'Auto-Sync disattivato: la vista rimarrà sulla pagina corrente.');
        }
        refreshIcons();
    });

    // Thumbnail Scrolling Arrows
    elements.btnScrollThumbsLeft.addEventListener('click', () => {
        elements.thumbnailStrip.scrollBy({ left: -220, behavior: 'smooth' });
    });
    elements.btnScrollThumbsRight.addEventListener('click', () => {
        elements.thumbnailStrip.scrollBy({ left: 220, behavior: 'smooth' });
    });

    // Render KaTeX Math in an element
    function renderMathFormulas(element) {
        if (window.renderMathInElement) {
            window.renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\begin{equation}', right: '\\end{equation}', display: true },
                    { left: '\\begin{align}', right: '\\end{align}', display: true },
                    { left: '\\begin{alignat}', right: '\\end{alignat}', display: true },
                    { left: '\\begin{gather}', right: '\\end{gather}', display: true }
                ],
                throwOnError: false,
                strict: false,
                trust: true
            });
        }
    }

    // Centralized Markdown + Math Renderer (Protects LaTeX from Marked underscore corruption and preserves $$)
    function renderMarkdownWithMath(targetElement, mdText) {
        if (!targetElement) return;
        if (!mdText || !mdText.trim()) {
            targetElement.innerHTML = '';
            return;
        }

        // 1. Isolate math blocks ($$, $, \[, \(, \begin{...}) using unique placeholders
        const mathBlocks = [];
        const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+?(?<!\s)\$|\\begin\{(?:equation|align|alignat|gather)\*?\}[\s\S]*?\\end\{(?:equation|align|alignat|gather)\*?\})/g;
        const protectedText = mdText.replace(mathRegex, (match) => {
            const placeholder = `%%GLM_MATH_${mathBlocks.length}%%`;
            mathBlocks.push(match);
            return placeholder;
        });

        // 2. Parse Markdown safely with Marked
        let html = '';
        if (window.marked) {
            html = marked.parse(protectedText);
        } else {
            html = `<pre class="text-xs p-2">${escapeHtml(protectedText)}</pre>`;
        }

        // 3. Restore protected math blocks (MUST use function replacer () => math so $$ is never collapsed to $)
        mathBlocks.forEach((math, idx) => {
            html = html.replace(`%%GLM_MATH_${idx}%%`, () => math);
        });

        targetElement.innerHTML = html;

        // 4. Render KaTeX formulas
        renderMathFormulas(targetElement);
    }

    // Render Markdown Helper fallback
    function renderMarkdown(mdText) {
        if (!mdText || !mdText.trim()) {
            return '';
        }
        if (window.marked) {
            return marked.parse(mdText);
        }
        return `<pre class="text-xs p-2">${escapeHtml(mdText)}</pre>`;
    }

    function escapeHtml(string) {
        return String(string).replace(/[&<>"'`=\/]/g, function (s) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '/': '&#x2F;',
                '`': '&#x60;',
                '=': '&#x3D;'
            }[s];
        });
    }

    // Get Active Task Prompt
    function getSelectedPrompt() {
        const preset = elements.selectPromptPreset.value;
        if (preset === 'custom') {
            return elements.inputCustomPrompt.value.trim() || 'Text Recognition:';
        }
        const map = {
            'text': 'Text Recognition:',
            'table': 'Table Recognition:',
            'formula': 'Formula Recognition:'
        };
        return map[preset] || 'Text Recognition:';
    }

    // Tab Switching
    function setTab(tabName) {
        state.activeTab = tabName;

        // Reset tab buttons
        [elements.tabFormatted, elements.tabRaw, elements.tabSplit, elements.tabLogs].forEach(btn => {
            btn.className = 'flex items-center space-x-1 px-2.5 py-1 rounded-md text-slate-400 hover:text-slate-200 transition';
        });

        // Hide all views
        elements.viewFormatted.classList.add('hidden');
        elements.viewRaw.classList.add('hidden');
        elements.viewSplit.classList.add('hidden');
        elements.viewLogs.classList.add('hidden');

        const activeClass = 'flex items-center space-x-1 px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium shadow-sm transition';

        if (tabName === 'formatted') {
            elements.tabFormatted.className = activeClass;
            elements.viewFormatted.classList.remove('hidden');
        } else if (tabName === 'raw') {
            elements.tabRaw.className = activeClass;
            elements.viewRaw.classList.remove('hidden');
        } else if (tabName === 'split') {
            elements.tabSplit.className = activeClass;
            elements.viewSplit.classList.remove('hidden');
        } else if (tabName === 'logs') {
            elements.tabLogs.className = activeClass;
            elements.viewLogs.classList.remove('hidden');
            elements.logTerminalOutput.scrollTop = elements.logTerminalOutput.scrollHeight;
        }
        refreshIcons();
    }

    elements.tabFormatted.addEventListener('click', () => setTab('formatted'));
    elements.tabRaw.addEventListener('click', () => setTab('raw'));
    elements.tabSplit.addEventListener('click', () => setTab('split'));
    elements.tabLogs.addEventListener('click', () => setTab('logs'));

    elements.selectPromptPreset.addEventListener('change', () => {
        if (elements.selectPromptPreset.value === 'custom') {
            elements.customPromptContainer.classList.remove('hidden');
        } else {
            elements.customPromptContainer.classList.add('hidden');
        }
    });

    // Finalize UI when a document is fully loaded
    function setupLoadedDocument(doc) {
        state.docId = doc.doc_id;
        state.filename = doc.filename;
        state.totalPages = doc.total_pages;
        state.pages = doc.pages;
        state.currentPage = 1;

        addLog('SUCCESS', `Documento pronto: ${doc.filename}, ${doc.total_pages} pagine convertite a ${state.settings.dpi} DPI.`);

        // Update UI Header
        elements.docTitleBadge.textContent = `${doc.filename} (${doc.total_pages} pag.)`;
        elements.docTitleBadge.classList.remove('hidden');
        elements.btnExportDoc.disabled = false;
        elements.btnProcessAll.disabled = false;
        elements.btnProcessPage.disabled = false;
        elements.btnCopyMd.disabled = false;

        elements.labelTotalPages.textContent = doc.total_pages;
        elements.inputCurrentPage.max = doc.total_pages;
        elements.inputCurrentPage.value = 1;

        elements.uploadOverlay.classList.add('hidden');
        buildThumbnails();
        loadPage(1);
    }

    // File Upload Handler with Multi-page Progress Tracking
    async function uploadFile(file) {
        if (!file) return;

        addLog('INFO', `Caricamento file: ${file.name} (${(file.size / (1024*1024)).toFixed(2)} MB)`);
        elements.uploadOverlay.classList.remove('hidden');
        const originalContent = elements.dropArea.innerHTML;
        elements.dropArea.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 space-y-4 max-w-md w-full">
                <div class="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <i data-lucide="file-up" class="w-6 h-6 animate-pulse"></i>
                </div>
                <div class="text-center w-full">
                    <h3 id="convert-status-title" class="text-base font-semibold text-white mb-1">Caricamento documento...</h3>
                    <p id="convert-progress-text" class="text-xs text-blue-400 font-mono mb-3">Preparazione rendering ad alta risoluzione...</p>
                    <div class="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/80 mb-2">
                        <div id="convert-progress-bar" class="bg-gradient-to-r from-blue-500 to-emerald-400 h-2.5 rounded-full transition-all duration-150 ease-out" style="width: 0%"></div>
                    </div>
                    <div class="flex justify-between text-[11px] text-slate-400 font-mono px-0.5">
                        <span id="convert-page-details">${file.name}</span>
                        <span id="convert-dpi-label">${state.settings.dpi} DPI</span>
                    </div>
                </div>
            </div>
        `;
        refreshIcons();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('dpi', state.settings.dpi);
        formData.append('async_convert', 'true');

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Errore nel caricamento del file');
            }

            const data = await res.json();
            const doc = data.document;

            // Se la conversione è già completata (es. file singolo o sincrono)
            if (!data.async_convert || (doc.pages && doc.pages.length > 0)) {
                setupLoadedDocument(doc);
                return;
            }

            // Altrimenti segui lo stream di conversione SSE in tempo reale
            const statusTitle = document.getElementById('convert-status-title');
            const progressText = document.getElementById('convert-progress-text');
            const progressBar = document.getElementById('convert-progress-bar');
            if (statusTitle) statusTitle.textContent = 'Conversione pagine in corso...';

            addLog('INFO', `Avvio conversione ad alta risoluzione: ${doc.filename} (${doc.total_pages} pagine a ${state.settings.dpi} DPI)...`);

            const streamUrl = data.stream_url || `/api/document/${doc.doc_id}/convert-stream?dpi=${state.settings.dpi}`;
            const convertSource = new EventSource(streamUrl);

            convertSource.onmessage = (event) => {
                try {
                    const evt = JSON.parse(event.data);
                    if (evt.type === 'progress') {
                        if (progressBar) progressBar.style.width = `${evt.percent}%`;
                        if (progressText) progressText.textContent = `Pagina ${evt.current} di ${evt.total} (${evt.percent}%)`;
                        if (evt.current % 25 === 0 || evt.current === evt.total) {
                            addLog('INFO', `Rendering: ${evt.current}/${evt.total} pagine completate (${evt.percent}%)...`);
                        }
                    } else if (evt.type === 'completed') {
                        convertSource.close();
                        if (progressBar) progressBar.style.width = '100%';
                        if (progressText) progressText.textContent = `Completato! ${evt.document.total_pages} pagine pronte.`;
                        setTimeout(() => {
                            setupLoadedDocument(evt.document);
                        }, 250);
                    }
                } catch (e) {
                    console.error('Error parsing convert-stream event', e);
                }
            };

            convertSource.onerror = (err) => {
                convertSource.close();
                addLog('ERROR', 'Connessione interrotta durante la conversione delle pagine.');
                alert('Connessione interrotta durante la conversione delle pagine.');
                elements.dropArea.innerHTML = originalContent;
                refreshIcons();
            };

        } catch (error) {
            addLog('ERROR', `Caricamento fallito: ${error.message}`);
            alert(`Errore: ${error.message}`);
            elements.dropArea.innerHTML = originalContent;
            refreshIcons();
        }
    }

    // Drag and Drop Events
    elements.btnBrowseTrigger.addEventListener('click', () => elements.fileInput.click());
    elements.btnOpenFile.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });

    ['dragenter', 'dragover'].forEach(name => {
        elements.dropArea.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.dropArea.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        elements.dropArea.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.dropArea.classList.remove('drag-over');
        });
    });

    elements.dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length > 0) {
            uploadFile(dt.files[0]);
        }
    });

    // Build Thumbnail Strip with explicit color coding
    function buildThumbnails() {
        elements.thumbnailStrip.innerHTML = '';
        state.pages.forEach(p => {
            const thumb = document.createElement('button');
            const isSelected = (p.page_num === state.currentPage);
            const isCompleted = (p.ocr_status === 'completed');
            const isProcessing = (p.ocr_status === 'processing');
            const isError = (p.ocr_status === 'error');

            let colorClasses = '';
            let dot = '';

            if (isSelected) {
                // Selezione attiva: VERDE
                colorClasses = 'border-emerald-500 bg-emerald-500/25 text-emerald-300 font-bold ring-1 ring-emerald-500 shadow-sm';
                dot = '<span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>';
            } else if (isCompleted) {
                // Pagina completata: BLU / CYAN
                colorClasses = 'border-blue-500/70 bg-blue-500/15 text-blue-300 font-medium hover:bg-blue-500/25';
                dot = '<span class="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>';
            } else if (isProcessing) {
                // Elaborazione: GIALLO / AMBER PULSE
                colorClasses = 'border-amber-400 bg-amber-400/20 text-amber-300 animate-pulse font-medium';
                dot = '<span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>';
            } else if (isError) {
                colorClasses = 'border-rose-500 bg-rose-500/20 text-rose-300 font-medium';
                dot = '<span class="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>';
            } else {
                // In attesa: GRIGIO
                colorClasses = 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200';
                dot = '<span class="w-2 h-2 rounded-full bg-slate-700 inline-block"></span>';
            }

            thumb.className = `thumbnail-item flex-shrink-0 cursor-pointer rounded-md border transition-all px-2 py-1 flex items-center space-x-1.5 text-xs ${colorClasses}`;
            thumb.id = `thumb-page-${p.page_num}`;
            thumb.innerHTML = `
                ${dot}
                <span class="font-mono text-[11px]">Pag. ${p.page_num}</span>
            `;

            thumb.addEventListener('click', () => {
                loadPage(p.page_num);
            });
            elements.thumbnailStrip.appendChild(thumb);
        });
    }

    // Auto-scroll and Reset Scroll for OCR Text Views
    function autoScrollRightPane() {
        if (elements.viewFormatted && !elements.viewFormatted.classList.contains('hidden')) {
            elements.viewFormatted.scrollTop = elements.viewFormatted.scrollHeight;
        }
        if (elements.rawEditor && elements.rawEditor.parentElement && !elements.rawEditor.parentElement.classList.contains('hidden')) {
            elements.rawEditor.scrollTop = elements.rawEditor.scrollHeight;
        }
        if (elements.viewSplit && !elements.viewSplit.classList.contains('hidden')) {
            if (elements.rawEditorSplit) elements.rawEditorSplit.scrollTop = elements.rawEditorSplit.scrollHeight;
            if (elements.formattedContentSplit) elements.formattedContentSplit.scrollTop = elements.formattedContentSplit.scrollHeight;
        }
    }

    function resetScrollRightPane() {
        if (elements.viewFormatted) elements.viewFormatted.scrollTop = 0;
        if (elements.rawEditor) elements.rawEditor.scrollTop = 0;
        if (elements.rawEditorSplit) elements.rawEditorSplit.scrollTop = 0;
        if (elements.formattedContentSplit) elements.formattedContentSplit.scrollTop = 0;
    }

    // Load Specific Page
    function loadPage(pageNum) {
        if (pageNum < 1 || pageNum > state.totalPages) return;
        state.currentPage = pageNum;
        elements.inputCurrentPage.value = pageNum;
        resetScrollRightPane();

        // Update nav buttons
        elements.btnPrevPage.disabled = (pageNum <= 1);
        elements.btnNextPage.disabled = (pageNum >= state.totalPages);

        // Update thumbnail colors
        buildThumbnails();
        const activeThumb = document.getElementById(`thumb-page-${pageNum}`);
        if (activeThumb) {
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        // Load Page Image
        elements.imageLoadingSpinner.classList.remove('hidden');
        elements.docPageImage.classList.add('hidden');

        const imgUrl = `/api/document/${state.docId}/page/${pageNum}/image?t=${Date.now()}`;
        elements.docPageImage.onload = () => {
            elements.imageLoadingSpinner.classList.add('hidden');
            elements.docPageImage.classList.remove('hidden');
            updateImageTransform();
            elements.imageViewport.scrollTop = 0;
            elements.imageViewport.scrollLeft = 0;
        };
        elements.docPageImage.src = imgUrl;

        // Render Page OCR Result
        const pageData = state.pages.find(p => p.page_num === pageNum) || {};
        renderPageResult(pageData);
    }

    // Render Page OCR Results in UI
    function renderPageResult(pageData) {
        const status = pageData.ocr_status || 'pending';
        const result = pageData.ocr_result || '';

        // Status badge
        if (status === 'completed') {
            elements.pageStatusBadge.textContent = 'Completato';
            elements.pageStatusBadge.className = 'px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
            elements.pageDurationLabel.textContent = `⏱️ ${pageData.ocr_duration || 0}s`;
            elements.pageDurationLabel.classList.remove('hidden');
            elements.pageStreamingIndicator.classList.add('hidden');
            if (elements.btnCancelPageOcr) elements.btnCancelPageOcr.classList.add('hidden');
        } else if (status === 'processing') {
            elements.pageStatusBadge.textContent = 'Elaborazione in corso...';
            elements.pageStatusBadge.className = 'px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse';
            elements.pageDurationLabel.classList.add('hidden');
            elements.pageStreamingIndicator.classList.remove('hidden');
            if (state.isProcessing && !activeBatchEvtSource && elements.btnCancelPageOcr) {
                elements.btnCancelPageOcr.classList.remove('hidden');
            }
        } else if (status === 'error') {
            elements.pageStatusBadge.textContent = 'Errore OCR';
            elements.pageStatusBadge.className = 'px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30';
            elements.pageDurationLabel.classList.add('hidden');
            elements.pageStreamingIndicator.classList.add('hidden');
            if (elements.btnCancelPageOcr) elements.btnCancelPageOcr.classList.add('hidden');
        } else {
            elements.pageStatusBadge.textContent = 'In attesa di elaborazione';
            elements.pageStatusBadge.className = 'px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400';
            elements.pageDurationLabel.classList.add('hidden');
            elements.pageStreamingIndicator.classList.add('hidden');
            if (elements.btnCancelPageOcr) elements.btnCancelPageOcr.classList.add('hidden');
        }

        // Fill editors and rendered view
        const isLivePage = (state.isProcessing && currentlyProcessingPage === pageData.page_num);
        const displayText = isLivePage && liveAccumulatedText ? liveAccumulatedText : result;

        if (displayText && displayText.trim()) {
            elements.formattedPlaceholder.classList.add('hidden');
            elements.formattedContent.classList.remove('hidden');
            renderMarkdownWithMath(elements.formattedContent, displayText);

            elements.rawEditor.value = displayText;
            elements.rawEditorSplit.value = displayText;
            renderMarkdownWithMath(elements.formattedContentSplit, displayText);
        } else if (isLivePage || status === 'processing') {
            elements.formattedPlaceholder.classList.add('hidden');
            elements.formattedContent.classList.remove('hidden');
            elements.formattedContent.innerHTML = '<span class="text-slate-500 italic">In attesa dei primi token dal modello...</span>';
            elements.formattedContentSplit.innerHTML = '<span class="text-slate-500 italic">In attesa dei primi token dal modello...</span>';
            elements.rawEditor.value = '';
            elements.rawEditorSplit.value = '';
        } else {
            elements.formattedPlaceholder.classList.remove('hidden');
            elements.formattedContent.classList.add('hidden');
            elements.formattedContent.innerHTML = '';
            elements.rawEditor.value = '';
            elements.rawEditorSplit.value = '';
            elements.formattedContentSplit.innerHTML = '';
        }

        elements.btnSaveEdit.classList.add('hidden');
        refreshIcons();
    }

    // Input page change
    elements.inputCurrentPage.addEventListener('change', () => {
        let val = parseInt(elements.inputCurrentPage.value, 10);
        if (isNaN(val)) val = 1;
        val = Math.max(1, Math.min(state.totalPages, val));
        loadPage(val);
    });

    elements.btnPrevPage.addEventListener('click', () => loadPage(state.currentPage - 1));
    elements.btnNextPage.addEventListener('click', () => loadPage(state.currentPage + 1));

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return;
        }
        if (e.key === 'ArrowLeft') {
            loadPage(state.currentPage - 1);
        } else if (e.key === 'ArrowRight') {
            loadPage(state.currentPage + 1);
        } else if (e.key === 'Enter' && e.ctrlKey) {
            elements.btnProcessPage.click();
        }
    });

    // Zoom and Rotate controls
    function updateImageTransform() {
        if (!elements.docPageImage.naturalWidth) return;

        const isSideways = (state.rotation % 180 !== 0);
        const baseWidth = isSideways ? elements.docPageImage.naturalHeight : elements.docPageImage.naturalWidth;
        const targetWidth = Math.round(baseWidth * state.zoom);

        elements.docPageImage.style.width = `${targetWidth}px`;
        elements.docPageImage.style.maxWidth = 'none';
        elements.docPageImage.style.height = 'auto';

        if (state.rotation % 360 !== 0) {
            elements.imageTransformContainer.style.transform = `rotate(${state.rotation}deg)`;
        } else {
            elements.imageTransformContainer.style.transform = '';
        }
        elements.zoomLevelLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    }

    elements.btnZoomIn.addEventListener('click', () => {
        state.zoom = Math.min(4.0, state.zoom + 0.15);
        updateImageTransform();
    });

    elements.btnZoomOut.addEventListener('click', () => {
        state.zoom = Math.max(0.15, state.zoom - 0.15);
        updateImageTransform();
    });

    // Fit Width
    elements.btnZoomFitWidth.addEventListener('click', () => {
        if (!elements.docPageImage.naturalWidth) return;
        const isSideways = (state.rotation % 180 !== 0);
        const baseWidth = isSideways ? elements.docPageImage.naturalHeight : elements.docPageImage.naturalWidth;
        const containerWidth = elements.imageViewport.clientWidth - 48;
        state.zoom = Math.max(0.1, containerWidth / baseWidth);
        updateImageTransform();
        elements.imageViewport.scrollTop = 0;
        elements.imageViewport.scrollLeft = 0;
        addLog('INFO', `Zoom adattato alla larghezza: ${Math.round(state.zoom * 100)}%`);
    });

    // Fit Height (Optimized to view full page vertically)
    elements.btnZoomFitHeight.addEventListener('click', () => {
        if (!elements.docPageImage.naturalHeight) return;
        const isSideways = (state.rotation % 180 !== 0);
        const baseHeight = isSideways ? elements.docPageImage.naturalWidth : elements.docPageImage.naturalHeight;
        const containerHeight = elements.imageViewport.clientHeight - 48;
        state.zoom = Math.max(0.1, containerHeight / baseHeight);
        updateImageTransform();
        elements.imageViewport.scrollTop = 0;
        elements.imageViewport.scrollLeft = 0;
        addLog('INFO', `Zoom adattato all'altezza: ${Math.round(state.zoom * 100)}%`);
    });

    elements.btnRotate.addEventListener('click', () => {
        state.rotation = (state.rotation + 90) % 360;
        updateImageTransform();
    });

    // Mouse Pan on Canvas
    elements.imageViewport.addEventListener('mousedown', (e) => {
        state.isDraggingImage = true;
        state.startX = e.pageX - elements.imageViewport.offsetLeft;
        state.startY = e.pageY - elements.imageViewport.offsetTop;
        state.scrollLeft = elements.imageViewport.scrollLeft;
        state.scrollTop = elements.imageViewport.scrollTop;
    });

    elements.imageViewport.addEventListener('mouseleave', () => state.isDraggingImage = false);
    elements.imageViewport.addEventListener('mouseup', () => state.isDraggingImage = false);

    elements.imageViewport.addEventListener('mousemove', (e) => {
        if (!state.isDraggingImage) return;
        e.preventDefault();
        const x = e.pageX - elements.imageViewport.offsetLeft;
        const y = e.pageY - elements.imageViewport.offsetTop;
        const walkX = (x - state.startX) * 1.5;
        const walkY = (y - state.startY) * 1.5;
        elements.imageViewport.scrollLeft = state.scrollLeft - walkX;
        elements.imageViewport.scrollTop = state.scrollTop - walkY;
    });

    // Manual Edit in Raw Editor Sync
    function handleEditorInput(newVal) {
        elements.btnSaveEdit.classList.remove('hidden');
        if (state.activeTab === 'split') {
            renderMarkdownWithMath(elements.formattedContentSplit, newVal);
        }
    }

    elements.rawEditor.addEventListener('input', (e) => {
        elements.rawEditorSplit.value = e.target.value;
        handleEditorInput(e.target.value);
    });

    elements.rawEditorSplit.addEventListener('input', (e) => {
        elements.rawEditor.value = e.target.value;
        handleEditorInput(e.target.value);
    });

    // Save Edit
    elements.btnSaveEdit.addEventListener('click', async () => {
        if (!state.docId) return;
        const currentVal = elements.rawEditor.value;
        try {
            const res = await fetch(`/api/document/${state.docId}/page/${state.currentPage}/save-edit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markdown: currentVal })
            });
            if (res.ok) {
                const pageData = state.pages.find(p => p.page_num === state.currentPage);
                if (pageData) pageData.ocr_result = currentVal;
                renderMarkdownWithMath(elements.formattedContent, currentVal);
                elements.btnSaveEdit.classList.add('hidden');
                addLog('SUCCESS', `Modifiche manuali salvate per pagina ${state.currentPage}.`);
            }
        } catch (err) {
            alert('Errore nel salvataggio delle modifiche');
        }
    });

    // Synchronized Scrolling in Affiancato View
    let isSyncingScrollFromRaw = false;
    let isSyncingScrollFromFormatted = false;

    elements.rawEditorSplit.addEventListener('scroll', () => {
        if (isSyncingScrollFromFormatted) {
            isSyncingScrollFromFormatted = false;
            return;
        }
        isSyncingScrollFromRaw = true;
        const maxRawScroll = elements.rawEditorSplit.scrollHeight - elements.rawEditorSplit.clientHeight;
        if (maxRawScroll > 0) {
            const ratio = elements.rawEditorSplit.scrollTop / maxRawScroll;
            const maxFormattedScroll = elements.formattedContentSplit.scrollHeight - elements.formattedContentSplit.clientHeight;
            elements.formattedContentSplit.scrollTop = ratio * maxFormattedScroll;
        }
    });

    elements.formattedContentSplit.addEventListener('scroll', () => {
        if (isSyncingScrollFromRaw) {
            isSyncingScrollFromRaw = false;
            return;
        }
        isSyncingScrollFromFormatted = true;
        const maxFormattedScroll = elements.formattedContentSplit.scrollHeight - elements.formattedContentSplit.clientHeight;
        if (maxFormattedScroll > 0) {
            const ratio = elements.formattedContentSplit.scrollTop / maxFormattedScroll;
            const maxRawScroll = elements.rawEditorSplit.scrollHeight - elements.rawEditorSplit.clientHeight;
            elements.rawEditorSplit.scrollTop = ratio * maxRawScroll;
        }
    });

    // --- RESIZABLE PANES (Main Splitter & Sub Splitter) ---
    function initSplitters() {
        // 1. Restore saved widths from localStorage
        const savedMainPct = localStorage.getItem('glm_ocr_split_main');
        if (savedMainPct && elements.leftPane) {
            const pct = parseFloat(savedMainPct);
            if (pct >= 15 && pct <= 85) {
                elements.leftPane.style.width = `${pct}%`;
            }
        }

        const savedSubPct = localStorage.getItem('glm_ocr_split_sub');
        if (savedSubPct && elements.splitRawPane) {
            const pct = parseFloat(savedSubPct);
            if (pct >= 15 && pct <= 85) {
                elements.splitRawPane.style.width = `${pct}%`;
            }
        }

        // 2. Main Splitter Dragging (Between Left and Right Panes)
        let isDraggingMain = false;
        if (elements.mainSplitter) {
            elements.mainSplitter.addEventListener('mousedown', (e) => {
                isDraggingMain = true;
                document.body.classList.add('is-resizing');
                e.preventDefault();
            });
        }

        // 3. Sub Splitter Dragging (Between Raw Editor and Preview in Affiancato view)
        let isDraggingSub = false;
        if (elements.subSplitter) {
            elements.subSplitter.addEventListener('mousedown', (e) => {
                isDraggingSub = true;
                document.body.classList.add('is-resizing');
                e.preventDefault();
            });
        }

        // Window mousemove & mouseup for resizers
        window.addEventListener('mousemove', (e) => {
            if (isDraggingMain && elements.leftPane) {
                const containerWidth = window.innerWidth;
                let leftPct = (e.clientX / containerWidth) * 100;
                leftPct = Math.max(15, Math.min(85, leftPct)); // clamp 15% - 85%
                elements.leftPane.style.width = `${leftPct}%`;
                localStorage.setItem('glm_ocr_split_main', leftPct.toFixed(1));
            } else if (isDraggingSub && elements.splitRawPane && elements.viewSplit) {
                const splitRect = elements.viewSplit.getBoundingClientRect();
                const relX = e.clientX - splitRect.left;
                let rawPct = (relX / splitRect.width) * 100;
                rawPct = Math.max(15, Math.min(85, rawPct));
                elements.splitRawPane.style.width = `${rawPct}%`;
                localStorage.setItem('glm_ocr_split_sub', rawPct.toFixed(1));
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingMain || isDraggingSub) {
                isDraggingMain = false;
                isDraggingSub = false;
                document.body.classList.remove('is-resizing');
            }
        });
    }
    initSplitters();

    // Timer management
    function startTimer() {
        state.timerStartTime = Date.now();
        elements.pageStreamingIndicator.classList.remove('hidden');
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.timerInterval = setInterval(() => {
            const elapsed = ((Date.now() - state.timerStartTime) / 1000).toFixed(1);
            if (elements.processingTimer) {
                elements.processingTimer.textContent = `Tempo: ${elapsed}s`;
            }
        }, 100);
    }

    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
        elements.pageStreamingIndicator.classList.add('hidden');
    }

    // Centralized reset for all processing states (cancellation, completion, error)
    function resetProcessingState() {
        stopTimer();
        if (liveRenderThrottle) {
            clearTimeout(liveRenderThrottle);
            liveRenderThrottle = null;
        }
        state.isProcessing = false;
        currentlyProcessingPage = null;
        liveAccumulatedText = '';
        elements.btnProcessPage.disabled = false;
        elements.btnProcessAll.disabled = false;
        if (elements.btnCancelPageOcr) elements.btnCancelPageOcr.classList.add('hidden');
        if (elements.batchProgressBox) elements.batchProgressBox.classList.add('hidden');
        if (elements.pageStreamingIndicator) elements.pageStreamingIndicator.classList.add('hidden');

        // Reset any page stuck in 'processing' status back to pending (or completed if it already had markdown)
        state.pages.forEach(p => {
            if (p.ocr_status === 'processing') {
                p.ocr_status = (p.ocr_result && p.ocr_result.trim()) ? 'completed' : 'pending';
            }
        });
    }

    // Active single-page SSE stream reference
    let activeSingleEvtSource = null;

    function cancelSinglePageOcr() {
        if (activeSingleEvtSource) {
            activeSingleEvtSource.close();
            activeSingleEvtSource = null;
        }
        const targetPageNum = currentlyProcessingPage || state.currentPage;
        resetProcessingState();
        addLog('INFO', `Elaborazione Pagina ${targetPageNum} interrotta dall'utente.`);
        buildThumbnails();
        loadPage(state.currentPage);
        refreshIcons();
    }

    if (elements.btnCancelPageOcr) {
        elements.btnCancelPageOcr.addEventListener('click', cancelSinglePageOcr);
    }

    // Process Single Page OCR with REAL-TIME STREAMING
    elements.btnProcessPage.addEventListener('click', async () => {
        if (!state.docId || state.isProcessing) return;

        const targetPageNum = state.currentPage;
        state.isProcessing = true;
        currentlyProcessingPage = targetPageNum;
        liveAccumulatedText = '';
        if (liveRenderThrottle) {
            clearTimeout(liveRenderThrottle);
            liveRenderThrottle = null;
        }

        elements.btnProcessPage.disabled = true;
        elements.btnProcessAll.disabled = true;

        // Set target page to processing and update status bar immediately
        const targetPage = state.pages.find(p => p.page_num === targetPageNum);
        if (targetPage) {
            targetPage.ocr_status = 'processing';
        }
        buildThumbnails();
        renderPageResult(targetPage || { page_num: targetPageNum, ocr_status: 'processing' });
        refreshIcons();

        startTimer();

        const prompt = getSelectedPrompt();
        addLog('OCR', `Avvio streaming OCR per Pagina ${targetPageNum} (prompt: "${prompt}")`);

        // Prepare UI for live streaming
        elements.formattedPlaceholder.classList.add('hidden');
        elements.formattedContent.classList.remove('hidden');
        elements.rawEditor.value = '';
        elements.rawEditorSplit.value = '';
        elements.formattedContent.innerHTML = '<span class="text-slate-500 italic">In attesa dei primi token dal modello...</span>';
        elements.formattedContentSplit.innerHTML = '<span class="text-slate-500 italic">In attesa dei primi token dal modello...</span>';

        const sseUrl = `/api/document/${state.docId}/page/${targetPageNum}/ocr-stream?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(state.settings.model)}`;
        const evtSource = new EventSource(sseUrl);
        activeSingleEvtSource = evtSource;

        evtSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'token') {
                    liveAccumulatedText += data.token;
                    elements.rawEditor.value = liveAccumulatedText;
                    elements.rawEditorSplit.value = liveAccumulatedText;

                    // Update rendered view with slight throttle for smooth rendering
                    if (!liveRenderThrottle) {
                        liveRenderThrottle = setTimeout(() => {
                            renderMarkdownWithMath(elements.formattedContent, liveAccumulatedText);
                            renderMarkdownWithMath(elements.formattedContentSplit, liveAccumulatedText);
                            autoScrollRightPane();
                            liveRenderThrottle = null;
                        }, 100);
                    }
                    autoScrollRightPane();
                } else if (data.type === 'done') {
                    evtSource.close();
                    activeSingleEvtSource = null;
                    resetProcessingState();

                    const updatedPage = data.page;
                    const idx = state.pages.findIndex(p => p.page_num === targetPageNum);
                    if (idx !== -1) state.pages[idx] = updatedPage;

                    buildThumbnails();
                    renderPageResult(updatedPage);
                    refreshIcons();
                    addLog('SUCCESS', `Pagina ${targetPageNum} completata con successo in ${updatedPage.ocr_duration || 0}s (${updatedPage.ocr_result.length} caratteri).`);
                } else if (data.type === 'error') {
                    evtSource.close();
                    activeSingleEvtSource = null;
                    resetProcessingState();

                    const targetPage = state.pages.find(p => p.page_num === targetPageNum);
                    if (targetPage) targetPage.ocr_status = 'error';

                    buildThumbnails();
                    loadPage(targetPageNum);
                    refreshIcons();

                    addLog('ERROR', `Errore OCR Pagina ${targetPageNum}: ${data.error}`);
                    alert(`Errore OCR: ${data.error}`);
                }
            } catch (e) {
                console.error('Error parsing SSE chunk', e);
            }
        };

        evtSource.onerror = (err) => {
            evtSource.close();
            activeSingleEvtSource = null;
            resetProcessingState();

            buildThumbnails();
            loadPage(targetPageNum);
            refreshIcons();

            addLog('ERROR', `Connessione streaming interrotta per Pagina ${targetPageNum}`);
        };
    });

    // Active batch SSE stream reference
    let activeBatchEvtSource = null;

    if (elements.btnCancelBatch) {
        elements.btnCancelBatch.addEventListener('click', () => {
            if (activeBatchEvtSource) {
                activeBatchEvtSource.close();
                activeBatchEvtSource = null;
            }
            resetProcessingState();
            addLog('INFO', 'Elaborazione batch interrotta dall\'utente.');
            buildThumbnails();
            loadPage(state.currentPage);
            refreshIcons();
        });
    }

    // Process All Pages Batch (SSE) with Real-Time View Follow / Auto-Sync
    elements.btnProcessAll.addEventListener('click', () => {
        if (!state.docId || state.isProcessing) return;

        state.isProcessing = true;
        currentlyProcessingPage = null;
        liveAccumulatedText = '';
        if (liveRenderThrottle) {
            clearTimeout(liveRenderThrottle);
            liveRenderThrottle = null;
        }

        elements.btnProcessAll.disabled = true;
        elements.btnProcessPage.disabled = true;
        elements.batchProgressBox.classList.remove('hidden');

        const prompt = encodeURIComponent(getSelectedPrompt());
        const model = encodeURIComponent(state.settings.model);
        const sseUrl = `/api/document/${state.docId}/ocr-all?prompt=${prompt}&model=${model}`;

        addLog('OCR', `Avvio elaborazione batch di tutte le ${state.totalPages} pagine... (Auto-Sync: ${state.autoSync ? 'ON' : 'OFF'})`);
        const evtSource = new EventSource(sseUrl);
        activeBatchEvtSource = evtSource;

        evtSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'page_start') {
                currentlyProcessingPage = data.page_num;
                liveAccumulatedText = '';
                if (liveRenderThrottle) {
                    clearTimeout(liveRenderThrottle);
                    liveRenderThrottle = null;
                }

                elements.batchProgressText.textContent = `Pagina ${data.page_num} di ${data.total}`;
                const pct = Math.round(((data.page_num - 1) / data.total) * 100);
                elements.batchProgressBar.style.width = `${pct}%`;

                // Set page status in state to processing
                const targetPage = state.pages.find(p => p.page_num === data.page_num);
                if (targetPage) targetPage.ocr_status = 'processing';
                buildThumbnails();

                // If auto-sync is ON, automatically navigate to the currently active page!
                if (state.autoSync && state.currentPage !== data.page_num) {
                    loadPage(data.page_num);
                } else if (state.currentPage === data.page_num) {
                    // Update current page view to show streaming initialization
                    elements.formattedPlaceholder.classList.add('hidden');
                    elements.formattedContent.classList.remove('hidden');
                    elements.formattedContent.innerHTML = '<span class="text-slate-500 italic">In attesa dei primi token dal modello...</span>';
                    elements.formattedContentSplit.innerHTML = '<span class="text-slate-500 italic">In attesa dei primi token dal modello...</span>';
                    elements.rawEditor.value = '';
                    elements.rawEditorSplit.value = '';
                    renderPageResult(targetPage || { page_num: data.page_num, ocr_status: 'processing' });
                }
                addLog('STREAM', `Inizio elaborazione Pagina ${data.page_num}/${data.total}...`);

            } else if (data.type === 'page_token') {
                if (currentlyProcessingPage === data.page_num) {
                    liveAccumulatedText += data.token;
                }

                // If user is currently viewing this page, stream live token to raw AND formatted view!
                if (data.page_num === state.currentPage) {
                    elements.formattedPlaceholder.classList.add('hidden');
                    elements.formattedContent.classList.remove('hidden');
                    elements.rawEditor.value = liveAccumulatedText;
                    elements.rawEditorSplit.value = liveAccumulatedText;

                    if (!liveRenderThrottle) {
                        liveRenderThrottle = setTimeout(() => {
                            if (data.page_num === state.currentPage) {
                                renderMarkdownWithMath(elements.formattedContent, liveAccumulatedText);
                                renderMarkdownWithMath(elements.formattedContentSplit, liveAccumulatedText);
                                autoScrollRightPane();
                            }
                            liveRenderThrottle = null;
                        }, 100);
                    }
                    autoScrollRightPane();
                }

            } else if (data.type === 'page_completed' || data.type === 'page_error') {
                if (liveRenderThrottle) {
                    clearTimeout(liveRenderThrottle);
                    liveRenderThrottle = null;
                }
                const updatedPage = data.page;
                const idx = state.pages.findIndex(p => p.page_num === updatedPage.page_num);
                if (idx !== -1) state.pages[idx] = updatedPage;
                
                if (currentlyProcessingPage === updatedPage.page_num) {
                    liveAccumulatedText = '';
                }

                buildThumbnails();
                if (updatedPage.page_num === state.currentPage) {
                    renderPageResult(updatedPage);
                }

                const pct = Math.round((updatedPage.page_num / data.total) * 100);
                elements.batchProgressBar.style.width = `${pct}%`;

                if (data.type === 'page_completed') {
                    addLog('SUCCESS', `Pagina ${updatedPage.page_num} completata (${updatedPage.ocr_duration || 0}s).`);
                } else {
                    addLog('ERROR', `Pagina ${updatedPage.page_num} errore: ${data.error}`);
                }

            } else if (data.type === 'all_finished') {
                evtSource.close();
                activeBatchEvtSource = null;
                resetProcessingState();
                buildThumbnails();
                loadPage(state.currentPage);
                refreshIcons();
                addLog('SUCCESS', `Elaborazione di tutte le ${data.total} pagine completata con successo!`);
                alert('Elaborazione di tutte le pagine completata con successo!');
            }
        };

        evtSource.onerror = () => {
            evtSource.close();
            activeBatchEvtSource = null;
            resetProcessingState();
            buildThumbnails();
            loadPage(state.currentPage);
            refreshIcons();
            addLog('ERROR', 'Connessione streaming batch interrotta.');
            alert('Connessione stream interrotta durante il batch.');
        };
    });

    // Copy to Clipboard
    elements.btnCopyMd.addEventListener('click', async () => {
        const text = elements.rawEditor.value;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            const originalIcon = elements.btnCopyMd.innerHTML;
            elements.btnCopyMd.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>';
            refreshIcons();
            addLog('INFO', `Markdown della pagina ${state.currentPage} copiato negli appunti.`);
            setTimeout(() => {
                elements.btnCopyMd.innerHTML = originalIcon;
                refreshIcons();
            }, 1500);
        } catch (e) {
            alert('Impossibile copiare negli appunti');
        }
    });

    // Export Consolidated Document
    elements.btnExportDoc.addEventListener('click', () => {
        if (!state.docId) return;
        addLog('INFO', `Scaricamento documento consolidato: ${state.filename}_ocr.md`);
        window.location.href = `/api/document/${state.docId}/export`;
    });

    // Settings Modal logic & Ollama connection test
    async function runConnectionTest(autoSelect = false) {
        const testUrl = elements.settingOllamaUrl.value.trim();
        const testModel = elements.selectInstalledModels.value || elements.settingModelName.value.trim() || 'glm-ocr:latest';

        elements.connectionStatusFeedback.classList.remove('hidden');
        elements.connectionStatusFeedback.className = 'mt-1.5 text-[11px] text-blue-400 flex items-center space-x-1';
        elements.connectionStatusFeedback.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Verifica connessione in corso...</span>';
        refreshIcons();

        try {
            const query = new URLSearchParams({ url: testUrl, model: testModel });
            const res = await fetch(`/api/health?${query.toString()}`);
            const data = await res.json();

            if (data.online) {
                installedOllamaModels = data.models || [];
                elements.connectionStatusFeedback.className = 'mt-1.5 text-[11px] text-emerald-400 flex items-center space-x-1';
                elements.connectionStatusFeedback.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i><span>Server Ollama raggiungibile (${installedOllamaModels.length} modelli installati)</span>`;

                // Ricostruisce il menu mostrando SOLO i modelli ufficiali GLM-OCR
                const currentSelected = elements.selectInstalledModels.value || testModel;
                elements.selectInstalledModels.innerHTML = '';
                
                OFFICIAL_GLM_MODELS.forEach(m => {
                    const isInstalled = installedOllamaModels.some(im => {
                        const imL = im.toLowerCase();
                        const idL = m.id.toLowerCase();
                        return imL === idL || imL.startsWith(idL) || idL.startsWith(imL);
                    });
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = `${m.label} ${isInstalled ? '✓ [Presente sul server]' : '✗ [Da scaricare]'}`;
                    elements.selectInstalledModels.appendChild(opt);
                });

                // Se l'utente ha anche altri tag locali specifici di glm-ocr sul server
                installedOllamaModels.forEach(im => {
                    const imL = im.toLowerCase();
                    if (imL.includes('glm-ocr') && !OFFICIAL_GLM_MODELS.some(m => m.id.toLowerCase() === imL)) {
                        const opt = document.createElement('option');
                        opt.value = im;
                        opt.textContent = `${im} ✓ [Presente sul server]`;
                        elements.selectInstalledModels.appendChild(opt);
                    }
                });

                if (currentSelected) {
                    elements.selectInstalledModels.value = currentSelected;
                    elements.settingModelName.value = currentSelected;
                }

                // Verifica se il modello attualmente selezionato è presente
                evaluateModelPresence(elements.selectInstalledModels.value || testModel);
            } else {
                elements.connectionStatusFeedback.className = 'mt-1.5 text-[11px] text-rose-400 flex items-center space-x-1';
                elements.connectionStatusFeedback.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i><span>${data.error || 'Server non raggiungibile'}</span>`;
                elements.modelStatusBadge.classList.add('hidden');
                elements.pullModelContainer.classList.add('hidden');
            }
        } catch (err) {
            elements.connectionStatusFeedback.className = 'mt-1.5 text-[11px] text-rose-400 flex items-center space-x-1';
            elements.connectionStatusFeedback.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i><span>Errore di comunicazione: ${err.message}</span>`;
            elements.modelStatusBadge.classList.add('hidden');
            elements.pullModelContainer.classList.add('hidden');
        }
        refreshIcons();
    }

    function evaluateModelPresence(modelName) {
        if (!modelName) {
            elements.modelStatusBadge.classList.add('hidden');
            elements.pullModelContainer.classList.add('hidden');
            return;
        }

        const cleanName = modelName.trim().toLowerCase();
        const found = installedOllamaModels.some(m => {
            const mLower = m.toLowerCase();
            return mLower === cleanName || mLower.startsWith(cleanName + ':') || cleanName.startsWith(mLower + ':');
        });

        elements.modelStatusBadge.classList.remove('hidden');
        if (found) {
            elements.modelStatusBadge.className = 'text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
            elements.modelStatusBadge.textContent = '✓ Installato sul server';
            elements.pullModelContainer.classList.add('hidden');
        } else {
            elements.modelStatusBadge.className = 'text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30';
            elements.modelStatusBadge.textContent = '✗ Non installato sul server';
            elements.pullModelContainer.classList.remove('hidden');
            elements.pullProgressBox.classList.add('hidden');
            elements.btnPullModel.disabled = false;
        }
    }

    elements.btnTestConnection.addEventListener('click', () => {
        runConnectionTest();
    });

    elements.selectInstalledModels.addEventListener('change', (e) => {
        if (e.target.value) {
            elements.settingModelName.value = e.target.value;
            evaluateModelPresence(e.target.value);
        }
    });

    // Scarica / Pull del modello da Ollama
    elements.btnPullModel.addEventListener('click', async () => {
        const modelToPull = elements.settingModelName.value.trim();
        const serverUrl = elements.settingOllamaUrl.value.trim();
        if (!modelToPull) {
            alert('Inserisci il nome del modello da scaricare.');
            return;
        }

        elements.btnPullModel.disabled = true;
        elements.pullProgressBox.classList.remove('hidden');
        elements.pullProgressBar.style.width = '0%';
        elements.pullPercentage.textContent = '0%';
        elements.pullStatusText.textContent = `Scaricamento ${modelToPull}...`;
        addLog('INFO', `Avvio download modello ${modelToPull} da Ollama...`);

        try {
            const response = await fetch('/api/ollama/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ollama_url: serverUrl, model: modelToPull })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // mantieni il frammento incompleto

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.status === 'error') {
                                elements.pullStatusText.textContent = `Errore: ${data.error}`;
                                elements.pullStatusText.className = 'text-rose-400';
                                addLog('ERROR', `Download modello fallito: ${data.error}`);
                                elements.btnPullModel.disabled = false;
                                return;
                            }

                            if (data.status) {
                                elements.pullStatusText.textContent = data.status;
                            }

                            if (data.total && data.completed) {
                                const pct = Math.round((data.completed / data.total) * 100);
                                elements.pullProgressBar.style.width = `${pct}%`;
                                elements.pullPercentage.textContent = `${pct}%`;
                            }

                            if (data.status === 'success') {
                                elements.pullProgressBar.style.width = '100%';
                                elements.pullPercentage.textContent = '100%';
                                elements.pullStatusText.textContent = 'Modello scaricato con successo!';
                                addLog('SUCCESS', `Modello ${modelToPull} scaricato e pronto all'uso.`);
                                await runConnectionTest();
                                return;
                            }
                        } catch (err) {
                            console.warn('Errore parsing SSE pull:', err);
                        }
                    }
                }
            }
        } catch (err) {
            elements.pullStatusText.textContent = `Errore di rete: ${err.message}`;
            elements.pullStatusText.className = 'text-rose-400';
            elements.btnPullModel.disabled = false;
            addLog('ERROR', `Errore connessione durante pull: ${err.message}`);
        }
    });

    // Settings Modal
    elements.btnOpenSettings.addEventListener('click', () => {
        openSettingsModal();
        refreshIcons();
    });

    elements.btnCloseSettings.addEventListener('click', () => {
        elements.settingsModal.classList.add('hidden');
    });

    elements.btnSaveSettings.addEventListener('click', async () => {
        state.settings.ollamaUrl = elements.settingOllamaUrl.value.trim();
        state.settings.model = elements.settingModelName.value.trim();
        state.settings.dpi = parseInt(elements.settingPdfDpi.value, 10);
        state.settings.temperature = parseFloat(elements.settingTemperature.value);

        localStorage.setItem('glm_ocr_settings', JSON.stringify(state.settings));

        // Notifica il backend del cambio configurazione per allineare l'istanza OcrEngine e salvare config.json
        try {
            await fetch('/api/settings/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ollama_url: state.settings.ollamaUrl,
                    model: state.settings.model,
                    dpi: state.settings.dpi,
                    temperature: state.settings.temperature
                })
            });
        } catch (e) {
            console.warn('Could not sync settings to backend', e);
        }

        elements.settingsModal.classList.add('hidden');
        addLog('INFO', `Impostazioni salvate: Server=${state.settings.ollamaUrl}, Modello=${state.settings.model}, DPI=${state.settings.dpi}`);
        checkOllamaHealth();
    });
});
