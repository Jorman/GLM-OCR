const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');

function testHtmlAndJsCleanPresets() {
    const htmlPath = path.join(rootDir, 'static', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert(html.includes('value="text"'), 'index.html must have text preset');
    assert(html.includes('value="table"'), 'index.html must have table preset');
    assert(html.includes('value="formula"'), 'index.html must have formula preset');
    assert(html.includes('value="custom"'), 'index.html must have custom preset');

    const jsPath = path.join(rootDir, 'static', 'js', 'app.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    assert(js.includes("'text': 'Text Recognition:'"), "app.js must map text preset");
    assert(js.includes("'table': 'Table Recognition:'"), "app.js must map table preset");
    assert(js.includes("'formula': 'Formula Recognition:'"), "app.js must map formula preset");
    console.log('✓ testHtmlAndJsCleanPresets passed');
}

function testMathProtection() {
    const jsPath = path.join(rootDir, 'static', 'js', 'app.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    // Check that math blocks are isolated with placeholders before marked parse
    assert(js.includes('%%GLM_MATH_'), 'app.js must isolate math blocks to prevent underscore corruption');
    assert(js.includes('() => math'), 'app.js must use function replacer to preserve $$ display math');
    console.log('✓ testMathProtection passed');
}

function runAll() {
    console.log('Running Frontend Clean Markdown Tests...');
    testHtmlAndJsCleanPresets();
    testMathProtection();
    console.log('ALL FRONTEND TESTS PASSED!');
}

runAll();
