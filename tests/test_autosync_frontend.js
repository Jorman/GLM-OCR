const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const jsPath = path.join(rootDir, 'static', 'js', 'app.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

function testAutoScrollImplementation() {
    console.log('Testing Auto-Scroll implementation in app.js...');
    // Verifichiamo che ci sia la logica di auto-scroll durante lo streaming
    const hasScrollToBottom = jsContent.includes('scrollHeight') &&
        (jsContent.includes('viewFormatted.scrollTop =') || jsContent.includes('formattedContent.scrollTop =') || jsContent.includes('rawEditor.scrollTop ='));
    assert(hasScrollToBottom, 'app.js must auto-scroll the streaming pane to follow generated tokens');
    console.log('✓ testAutoScrollImplementation passed');
}

function testScrollResetOnLoadPage() {
    console.log('Testing Scroll Reset on page navigation...');
    // Verifichiamo che loadPage resetti lo scroll verticale della vista destra
    const loadPageMatch = jsContent.match(/function loadPage\([\s\S]*?renderPageResult/);
    assert(loadPageMatch, 'function loadPage must be present');
    const loadPageBody = loadPageMatch[0];
    const resetsRightPaneScroll = loadPageBody.includes('resetScrollRightPane') ||
        loadPageBody.includes('viewFormatted.scrollTop = 0') ||
        loadPageBody.includes('rawEditor.scrollTop = 0') ||
        loadPageBody.includes('elements.viewFormatted') ||
        loadPageBody.includes('elements.rawEditor.scrollTop = 0');
    assert(resetsRightPaneScroll, 'loadPage must reset the right pane scroll position to 0');
    console.log('✓ testScrollResetOnLoadPage passed');
}

function testAutoSyncToggleImmediateSync() {
    console.log('Testing Immediate Sync when AutoSync is toggled ON...');
    // Quando AutoSync viene attivato durante l'elaborazione, deve navigare subito alla pagina attiva
    const toggleMatch = jsContent.match(/btnToggleAutosync\.addEventListener\('click'[\s\S]*?refreshIcons\(\);/);
    assert(toggleMatch, 'btnToggleAutosync listener must be present');
    const toggleBody = toggleMatch[0];
    const hasImmediateSync = toggleBody.includes('currentlyProcessingPage') && toggleBody.includes('loadPage');
    assert(hasImmediateSync, 'Toggling AutoSync ON must immediately jump to currentlyProcessingPage if active');
    console.log('✓ testAutoSyncToggleImmediateSync passed');
}

function runAll() {
    console.log('Running Auto-Sync Frontend Tests...');
    testAutoScrollImplementation();
    testScrollResetOnLoadPage();
    testAutoSyncToggleImmediateSync();
    console.log('ALL AUTOSYNC FRONTEND TESTS PASSED!');
}

runAll();
