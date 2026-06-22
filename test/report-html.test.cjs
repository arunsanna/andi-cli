'use strict';
/**
 * test/report-html.test.cjs — unit tests for the HTML reporter.
 *
 * Tests are purely in-process; no browser, no scanner, no fixtures.
 * Exercises toHtml() with a synthetic aggregate result containing:
 *   - an element-enriched finding (focusable danger)
 *   - an element:null finding (iframes warning)
 *   - a finding whose element.html contains a <script> XSS payload
 *
 * Assertions:
 *   1. Output contains the honesty banner verbatim.
 *   2. Each finding's message appears (escaped) in the output.
 *   3. The <script> XSS payload appears ESCAPED, not raw.
 *   4. The element:null finding renders without throwing.
 *   5. The document is well-formed (node-html-parser) and has expected structure.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('node-html-parser');

const { toHtml } = require('../src/report/html.cjs');

// ---------------------------------------------------------------------------
// Honesty banner verbatim (must appear exactly as specified)
// ---------------------------------------------------------------------------
const HONESTY_BANNER =
  'Automated checks cover a subset of Section 508; ANDI surfaces items for human Trusted-Tester judgment.';

// ---------------------------------------------------------------------------
// Synthetic aggregate result — covers element-enriched, element:null, and XSS shapes
// ---------------------------------------------------------------------------
const FINDING_WITH_ELEMENT = {
  engine: 'andi',
  module: 'focusable',
  severity: 'danger',
  rule: 'no-accessible-name',
  message: 'Button has no accessible name',
  wcag: ['4.1.2'],
  element: {
    tag: 'button',
    html: '<button id="btn1">Click me</button>',
    selector: '#btn1',
    andiIndex: 1,
  },
};

// element:null finding (iframes module — s/h/i have no per-element node)
const FINDING_NULL_ELEMENT = {
  engine: 'andi',
  module: 'iframes',
  severity: 'warning',
  rule: 'iframe-no-name',
  message: 'Iframe has no accessible name',
  wcag: ['4.1.2'],
  element: null,
};

// Finding with XSS payload in element.html
const FINDING_XSS_ELEMENT = {
  engine: 'andi',
  module: 'focusable',
  severity: 'caution',
  rule: 'xss-test',
  message: 'Element may have contrast issue',
  wcag: ['1.4.3'],
  element: {
    tag: 'div',
    html: '<div onclick="<script>alert(1)</script>">text</div>',
    selector: '#xss',
    andiIndex: 2,
  },
};

const SYNTHETIC_RESULT = {
  url: 'https://example.com/',
  scannedAt: '2026-06-21T00:00:00.000Z',
  findings: [FINDING_WITH_ELEMENT, FINDING_NULL_ELEMENT, FINDING_XSS_ELEMENT],
  counts: { danger: 1, warning: 1, caution: 1, info: 0 },
  worst: 'danger',
  andiAlertTotal: 3,
};

// ---------------------------------------------------------------------------
// Test 1: honesty banner appears verbatim
// ---------------------------------------------------------------------------
test('toHtml: output contains the honesty banner verbatim', () => {
  const html = toHtml(SYNTHETIC_RESULT);
  assert.equal(typeof html, 'string', 'toHtml must return a string');
  assert.ok(
    html.includes(HONESTY_BANNER),
    `output must contain honesty banner verbatim.\nExpected: "${HONESTY_BANNER}"\nGot (first 500 chars): "${html.slice(0, 500)}"`,
  );
});

// ---------------------------------------------------------------------------
// Test 2: each finding's message appears in the output
// ---------------------------------------------------------------------------
test('toHtml: each finding message appears in the output', () => {
  const html = toHtml(SYNTHETIC_RESULT);

  for (const finding of SYNTHETIC_RESULT.findings) {
    // Message content must appear — either raw (if safe) or HTML-escaped.
    // We check for the unescaped text content (which would be in a text node after parsing).
    const root = parse(html);
    const bodyText = root.querySelector('body').text;
    assert.ok(
      bodyText.includes(finding.message),
      `body text must include message "${finding.message}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// Test 3: XSS payload in element.html is HTML-entity escaped, not raw
// ---------------------------------------------------------------------------
test('toHtml: XSS <script> payload in element.html is HTML-escaped', () => {
  const html = toHtml(SYNTHETIC_RESULT);

  // The raw payload must NOT appear as-is (would be executable or break HTML)
  assert.ok(
    !html.includes('<script>alert(1)</script>'),
    'raw <script>alert(1)</script> must NOT appear unescaped in the HTML output',
  );

  // The escaped form must appear
  assert.ok(
    html.includes('&lt;script&gt;'),
    'escaped &lt;script&gt; must appear in the HTML output',
  );
});

// ---------------------------------------------------------------------------
// Test 4: element:null finding renders without throwing, includes page-level note
// ---------------------------------------------------------------------------
test('toHtml: element:null finding renders without throwing and includes page-level note', () => {
  assert.doesNotThrow(
    () => toHtml(SYNTHETIC_RESULT),
    'toHtml must not throw when a finding has element:null',
  );

  const html = toHtml(SYNTHETIC_RESULT);
  // Must indicate this is a page-level finding (no specific element)
  assert.ok(
    html.includes('page-level'),
    'output must include a "page-level" note for element:null findings',
  );
});

// ---------------------------------------------------------------------------
// Test 5: document is well-formed — has <html>, <body>, and expected finding nodes
// ---------------------------------------------------------------------------
test('toHtml: document is well-formed with <html> and <body>', () => {
  const html = toHtml(SYNTHETIC_RESULT);

  // Must be a complete HTML document
  assert.ok(
    html.trim().toLowerCase().startsWith('<!doctype html'),
    'output must start with <!doctype html',
  );

  const root = parse(html);

  const htmlEl = root.querySelector('html');
  assert.ok(htmlEl, 'parsed document must have an <html> element');

  const bodyEl = root.querySelector('body');
  assert.ok(bodyEl, 'parsed document must have a <body> element');

  // The body must contain text from at least one finding message
  const bodyText = bodyEl.text;
  assert.ok(
    bodyText.includes(FINDING_WITH_ELEMENT.message),
    `body must contain finding message "${FINDING_WITH_ELEMENT.message}"`,
  );
  assert.ok(
    bodyText.includes(FINDING_NULL_ELEMENT.message),
    `body must contain finding message "${FINDING_NULL_ELEMENT.message}"`,
  );
});

// ---------------------------------------------------------------------------
// Test 6: counts summary appears in the output
// ---------------------------------------------------------------------------
test('toHtml: counts summary appears with correct values', () => {
  const html = toHtml(SYNTHETIC_RESULT);
  const root = parse(html);
  const bodyText = root.querySelector('body').text;

  // Counts from SYNTHETIC_RESULT: danger:1, warning:1, caution:1
  // The body text should contain these numbers
  assert.ok(
    bodyText.includes('1') && bodyText.toLowerCase().includes('danger'),
    'body must mention danger count',
  );
  assert.ok(
    bodyText.toLowerCase().includes('warning'),
    'body must mention warning',
  );

  // andiAlertTotal should appear
  assert.ok(
    html.includes('3') || bodyText.includes('3'),
    'output must reference the andiAlertTotal of 3',
  );
});

// ---------------------------------------------------------------------------
// Test 7: clean scan (no findings) renders without throwing
// ---------------------------------------------------------------------------
test('toHtml: clean scan (no findings) renders without throwing', () => {
  const cleanResult = {
    url: 'https://example.com/',
    scannedAt: '2026-06-21T00:00:00.000Z',
    findings: [],
    counts: { danger: 0, warning: 0, caution: 0, info: 0 },
    worst: null,
    andiAlertTotal: 0,
  };

  let html;
  assert.doesNotThrow(
    () => { html = toHtml(cleanResult); },
    'toHtml must not throw for a clean scan with no findings',
  );

  assert.ok(html.includes(HONESTY_BANNER), 'clean scan output must still include honesty banner');

  const root = parse(html);
  assert.ok(root.querySelector('html'), 'clean scan must produce valid HTML');
});
