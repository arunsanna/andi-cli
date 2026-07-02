'use strict';
/**
 * test/report-json.test.cjs — unit tests for the JSON reporter.
 *
 * Tests are purely in-process; no browser, no scanner, no fixtures.
 * Exercises toJson() with a synthetic aggregate result containing:
 *   - an element-enriched finding (focusable danger)
 *   - an element:null finding (iframes warning)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toJson } = require('../src/report/json.cjs');

// ---------------------------------------------------------------------------
// Synthetic aggregate result that covers both element shapes.
// ---------------------------------------------------------------------------
const ELEMENT = {
  tag: 'button',
  html: '<button id="btn1">x</button>',
  selector: '#btn1',
  andiIndex: 1,
};

const FINDING_WITH_ELEMENT = {
  engine: 'andi',
  module: 'focusable',
  severity: 'danger',
  rule: 'no-accessible-name',
  message: 'Missing accessible name',
  wcag: ['4.1.2'],
  element: ELEMENT,
};

const FINDING_NULL_ELEMENT = {
  engine: 'andi',
  module: 'iframes',
  severity: 'warning',
  rule: 'iframe-no-name',
  message: 'Iframe has no accessible name',
  wcag: null,
  element: null,
};

const SYNTHETIC_RESULT = {
  url: 'https://example.com/',
  scannedAt: '2026-06-21T00:00:00.000Z',
  findings: [FINDING_WITH_ELEMENT, FINDING_NULL_ELEMENT],
  counts: { danger: 1, warning: 1, caution: 0, info: 0 },
  worst: 'danger',
  andiAlertTotal: 2,
};

// ---------------------------------------------------------------------------
// Test 1: top-level keys are all present with correct types
// ---------------------------------------------------------------------------
test('toJson: all documented top-level keys present with correct types', () => {
  const report = toJson(SYNTHETIC_RESULT);

  assert.equal(typeof report.tool, 'string',
    `tool must be a string, got ${typeof report.tool}`);
  assert.equal(report.tool, 'andi-cli',
    `tool must be 'andi-cli', got '${report.tool}'`);

  assert.equal(typeof report.version, 'string',
    `version must be a string, got ${typeof report.version}`);
  assert.match(report.version, /^\d+\.\d+\.\d+/,
    `version must be semver-like, got '${report.version}'`);

  // scannedAt may be null or a string
  assert.ok(
    report.scannedAt === null || typeof report.scannedAt === 'string',
    `scannedAt must be string or null, got ${typeof report.scannedAt}`
  );

  assert.ok(Array.isArray(report.urls),
    `urls must be an array, got ${typeof report.urls}`);

  assert.ok(Array.isArray(report.findings),
    `findings must be an array, got ${typeof report.findings}`);

  assert.ok(report.counts !== null && typeof report.counts === 'object' && !Array.isArray(report.counts),
    `counts must be a plain object, got ${JSON.stringify(report.counts)}`);

  // worst is a severity string or null
  assert.ok(
    report.worst === null || typeof report.worst === 'string',
    `worst must be string or null, got ${typeof report.worst}`
  );

  // andiAlertTotal is a number or null
  assert.ok(
    report.andiAlertTotal === null || typeof report.andiAlertTotal === 'number',
    `andiAlertTotal must be number or null, got ${typeof report.andiAlertTotal}`
  );
});

// ---------------------------------------------------------------------------
// Test 2: counts shape is { danger, warning, caution, info } with numeric values
// ---------------------------------------------------------------------------
test('toJson: counts object has correct shape and numeric values', () => {
  const report = toJson(SYNTHETIC_RESULT);
  const { counts } = report;

  for (const key of ['danger', 'warning', 'caution', 'info']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(counts, key),
      `counts must have key '${key}'`
    );
    assert.equal(typeof counts[key], 'number',
      `counts.${key} must be a number, got ${typeof counts[key]}`);
  }
  assert.equal(counts.danger, 1, 'counts.danger must be 1');
  assert.equal(counts.warning, 1, 'counts.warning must be 1');
  assert.equal(counts.caution, 0, 'counts.caution must be 0');
  assert.equal(counts.info, 0, 'counts.info must be 0');
});

// ---------------------------------------------------------------------------
// Test 3: findings array preserves both element shapes
// ---------------------------------------------------------------------------
test('toJson: findings preserve element-enriched and element:null shapes', () => {
  const report = toJson(SYNTHETIC_RESULT);

  assert.equal(report.findings.length, 2,
    `Expected 2 findings, got ${report.findings.length}`);

  const withEl = report.findings.find((f) => f.element !== null);
  const nullEl = report.findings.find((f) => f.element === null);

  assert.ok(withEl, 'one finding must have a non-null element');
  assert.ok(nullEl, 'one finding must have element:null');

  // element shape: tag, html, selector, andiIndex
  for (const key of ['tag', 'html', 'selector', 'andiIndex']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(withEl.element, key),
      `element must have key '${key}'`
    );
  }
  assert.equal(withEl.element.tag, 'button', 'element.tag must be "button"');
  assert.equal(withEl.element.selector, '#btn1', 'element.selector must be "#btn1"');

  // element:null preserved (not converted to {} or undefined)
  assert.equal(nullEl.element, null, 'element must remain null, not converted');
});

// ---------------------------------------------------------------------------
// Test 4: Finding objects keep all documented fields
// ---------------------------------------------------------------------------
test('toJson: Finding objects keep all documented fields', () => {
  const report = toJson(SYNTHETIC_RESULT);
  const REQUIRED_FINDING_KEYS = ['engine', 'module', 'severity', 'rule', 'message', 'wcag', 'element'];

  for (const finding of report.findings) {
    for (const key of REQUIRED_FINDING_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(finding, key),
        `finding must have key '${key}'; finding: ${JSON.stringify(finding)}`
      );
    }
    assert.ok(
      finding.engine === 'andi' || finding.engine === 'axe',
      `engine must be 'andi' or 'axe', got '${finding.engine}'`
    );
  }
});

// ---------------------------------------------------------------------------
// Test 5: round-trip serialization (fully JSON-serializable)
// ---------------------------------------------------------------------------
test('toJson: round-trips through JSON.stringify + JSON.parse without loss', () => {
  const report = toJson(SYNTHETIC_RESULT);
  const roundTripped = JSON.parse(JSON.stringify(report));

  // Keys present
  for (const key of ['tool', 'version', 'scannedAt', 'urls', 'findings', 'counts', 'worst', 'andiAlertTotal']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(roundTripped, key),
      `round-tripped report must have key '${key}'`
    );
  }

  // Deep equality on scalar fields
  assert.equal(roundTripped.tool, report.tool, 'tool must survive round-trip');
  assert.equal(roundTripped.version, report.version, 'version must survive round-trip');
  assert.equal(roundTripped.scannedAt, report.scannedAt, 'scannedAt must survive round-trip');
  assert.equal(roundTripped.worst, report.worst, 'worst must survive round-trip');
  assert.equal(roundTripped.andiAlertTotal, report.andiAlertTotal, 'andiAlertTotal must survive round-trip');
  assert.deepEqual(roundTripped.counts, report.counts, 'counts must survive round-trip');
  assert.deepEqual(roundTripped.urls, report.urls, 'urls must survive round-trip');

  // findings round-trip: element:null must come back as null not as undefined/missing
  const nullElAfter = roundTripped.findings.find((f) => f.element === null);
  assert.ok(nullElAfter, 'element:null finding must survive round-trip as null');
});

// ---------------------------------------------------------------------------
// Test 6: worst:null is preserved (clean scan)
// ---------------------------------------------------------------------------
test('toJson: worst:null is preserved for a clean scan', () => {
  const cleanResult = {
    url: 'https://example.com/',
    scannedAt: '2026-06-21T00:00:00.000Z',
    findings: [],
    counts: { danger: 0, warning: 0, caution: 0, info: 0 },
    worst: null,
    andiAlertTotal: 0,
  };

  const report = toJson(cleanResult);
  assert.equal(report.worst, null,
    `worst must remain null for a clean scan, got '${report.worst}'`);

  // worst:null must survive JSON serialization (not dropped as undefined would be)
  const json = JSON.stringify(report);
  const parsed = JSON.parse(json);
  assert.ok(
    Object.prototype.hasOwnProperty.call(parsed, 'worst'),
    'worst key must be present in JSON output (not dropped)'
  );
  assert.equal(parsed.worst, null, 'worst must be null in JSON output, not missing');
});

// ---------------------------------------------------------------------------
// Test 7: scannedAt override (caller-injected timestamp)
// ---------------------------------------------------------------------------
test('toJson: caller-injected scannedAt overrides result.scannedAt', () => {
  const INJECTED = '2026-01-01T12:00:00.000Z';
  const report = toJson(SYNTHETIC_RESULT, INJECTED);
  assert.equal(report.scannedAt, INJECTED,
    `scannedAt must use injected value '${INJECTED}', got '${report.scannedAt}'`);
});

// ---------------------------------------------------------------------------
// Test 8: urls is always an array (not null or undefined)
// ---------------------------------------------------------------------------
test('toJson: urls is always an array', () => {
  const report = toJson(SYNTHETIC_RESULT);
  assert.ok(Array.isArray(report.urls),
    `urls must always be an array, got ${JSON.stringify(report.urls)}`);
  assert.ok(report.urls.length > 0, 'urls must have at least one entry');
  assert.equal(report.urls[0], 'https://example.com/', 'urls[0] must match result.url');
});

test('toJson: multi-page result preserves all urls and directory metadata', () => {
  const report = toJson({
    ...SYNTHETIC_RESULT,
    url: 'directory:/tmp/site',
    directory: '/tmp/site',
    files: ['index.html', 'about.html'],
    urls: ['http://127.0.0.1:1234/index.html', 'http://127.0.0.1:1234/about.html'],
  });

  assert.equal(report.directory, '/tmp/site');
  assert.deepEqual(report.files, ['index.html', 'about.html']);
  assert.deepEqual(report.urls, ['http://127.0.0.1:1234/index.html', 'http://127.0.0.1:1234/about.html']);
});
