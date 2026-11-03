const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');

function testHtmlHasUnifiedStatusBarCancel() {
    const htmlPath = path.join(rootDir, 'static', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert(
        html.includes('id="btn-cancel-page-ocr"'),
        'index.html must have #btn-cancel-page-ocr button in status bar'
    );
    assert(
        !html.includes('id="ocr-processing-overlay"'),
        'index.html must NOT have #ocr-processing-overlay (removed for clean unified UI)'
    );
    assert(
        html.includes('id="btn-cancel-batch"'),
        'index.html must have #btn-cancel-batch button'
    );
    console.log('✓ testHtmlHasUnifiedStatusBarCancel passed');
}

function testJsHasUnifiedResetLogic() {
    const jsPath = path.join(rootDir, 'static', 'js', 'app.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    assert(
        js.includes('btnCancelPageOcr') || js.includes('btn-cancel-page-ocr'),
        'app.js must register btn-cancel-page-ocr in elements'
    );
    assert(
        js.includes('resetProcessingState'),
        'app.js must have centralized resetProcessingState function'
    );
    assert(
        js.includes('activeSingleEvtSource'),
        'app.js must track activeSingleEvtSource for single-page streaming cancellation'
    );
    assert(
        js.includes('cancelSinglePageOcr'),
        'app.js must implement cancelSinglePageOcr'
    );
    assert(
        js.includes("p.ocr_status = (p.ocr_result && p.ocr_result.trim()) ? 'completed' : 'pending'"),
        'app.js must reset pages stuck in processing back to pending/completed'
    );
    console.log('✓ testJsHasUnifiedResetLogic passed');
}

function runAll() {
    console.log('Running Unified UI & Cancel Tests...');
    testHtmlHasUnifiedStatusBarCancel();
    testJsHasUnifiedResetLogic();
    console.log('ALL UNIFIED UI & CANCEL TESTS PASSED!');
}

runAll();
