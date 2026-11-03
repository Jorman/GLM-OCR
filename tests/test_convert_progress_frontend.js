const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const jsPath = path.join(rootDir, 'static', 'js', 'app.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

function testUploadUsesAsyncConvert() {
    console.log('Testing uploadFile uses async_convert...');
    assert(jsContent.includes("async_convert', 'true'") || jsContent.includes('async_convert", "true"'),
        'app.js must pass async_convert=true to /api/upload');
    console.log('✓ testUploadUsesAsyncConvert passed');
}

function testUploadListensToConvertStream() {
    console.log('Testing uploadFile listens to convert-stream SSE...');
    assert(jsContent.includes('convert-stream') || jsContent.includes('stream_url'),
        'app.js must listen to convert-stream SSE stream for real-time progress');
    console.log('✓ testUploadListensToConvertStream passed');
}

function testProgressBarUiInDropArea() {
    console.log('Testing progress bar UI elements in dropArea during upload...');
    assert(jsContent.includes('convert-progress-bar'),
        'app.js must render a convert-progress-bar element for visual progress feedback');
    assert(jsContent.includes('convert-progress-text'),
        'app.js must render a convert-progress-text element for page numbers and percentage');
    console.log('✓ testProgressBarUiInDropArea passed');
}

function runAll() {
    console.log('Running Frontend Conversion Progress Tests...');
    testUploadUsesAsyncConvert();
    testUploadListensToConvertStream();
    testProgressBarUiInDropArea();
    console.log('ALL FRONTEND CONVERSION PROGRESS TESTS PASSED!');
}

runAll();
