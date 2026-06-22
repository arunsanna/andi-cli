'use strict';
/**
 * test/report-sarif.test.cjs — unit + schema validation tests for the SARIF 2.1.0 reporter.
 *
 * Validation V6: calls toSarif() with a synthetic aggregate result containing BOTH
 * an element-enriched finding AND an element:null finding, then validates the output
 * against the vendored SARIF 2.1.0 JSON schema via ajv.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const { toSarif } = require('../src/report/sarif.cjs');

// ---------------------------------------------------------------------------
// Vendored schema
// ---------------------------------------------------------------------------
const SCHEMA_PATH = path.join(__dirname, 'fixtures', 'sarif-2.1.0.schema.json');
const SARIF_SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSarif = ajv.compile(SARIF_SCHEMA);

// ---------------------------------------------------------------------------
// Synthetic aggregate result — covers both element shapes
// ---------------------------------------------------------------------------
const FINDING_WITH_ELEMENT = {
  engine: 'andi',
  module: 'focusable',
  severity: 'danger',
  rule: 'no-accessible-name',
  message: 'Button has no accessible name',
  wcag: ['4.1.2'],
  url: 'https://example.com/',
  element: {
    tag: 'button',
    html: '<button id="btn1">x</button>',
    selector: '#btn1',
    andiIndex: 1,
  },
};

// element:null finding (iframes module — s/h/i have no per-element node)
const FINDING_NULL_ELEMENT = {
  engine: 'andi',
  module: 'iframes',
  severity: 'warning',
  rule: 'iframe-no-title',
  message: 'Iframe has no accessible name or [title]',
  wcag: ['4.1.2', '2.4.1'],
  url: 'https://example.com/',
  element: null,
};

const SYNTHETIC_RESULT = {
  url: 'https://example.com/',
  version: '0.1.0',
  findings: [FINDING_WITH_ELEMENT, FINDING_NULL_ELEMENT],
  counts: { danger: 1, warning: 1, caution: 0, info: 0 },
  worst: 'danger',
};

// ---------------------------------------------------------------------------
// Test 1: toSarif does not throw on element:null findings (guard)
// ---------------------------------------------------------------------------
test('toSarif: does not throw when element is null', () => {
  assert.doesNotThrow(() => toSarif(SYNTHETIC_RESULT),
    'toSarif must not throw when a finding has element:null');
});

// ---------------------------------------------------------------------------
// Test 2: output is valid SARIF 2.1.0 per vendored schema
// ---------------------------------------------------------------------------
test('toSarif: output validates against vendored SARIF 2.1.0 schema', () => {
  const sarif = toSarif(SYNTHETIC_RESULT);
  const valid = validateSarif(sarif);
  if (!valid) {
    const errs = JSON.stringify(validateSarif.errors, null, 2);
    assert.fail(`SARIF output failed schema validation:\n${errs}`);
  }
  assert.ok(valid, 'SARIF output must be schema-valid');
});

// ---------------------------------------------------------------------------
// Test 3: required top-level keys
// ---------------------------------------------------------------------------
test('toSarif: top-level keys are correct', () => {
  const sarif = toSarif(SYNTHETIC_RESULT);
  assert.equal(sarif.$schema, 'https://json.schemastore.org/sarif-2.1.0.json',
    '$schema must point to SARIF 2.1.0 schema store');
  assert.equal(sarif.version, '2.1.0', 'version must be "2.1.0"');
  assert.ok(Array.isArray(sarif.runs), 'runs must be an array');
  assert.equal(sarif.runs.length, 1, 'runs must have exactly one entry');
});

// ---------------------------------------------------------------------------
// Test 4: tool driver metadata
// ---------------------------------------------------------------------------
test('toSarif: tool driver metadata is correct', () => {
  const sarif = toSarif(SYNTHETIC_RESULT);
  const driver = sarif.runs[0].tool.driver;
  assert.equal(driver.name, 'andi-cli', 'driver.name must be "andi-cli"');
  assert.ok(typeof driver.informationUri === 'string', 'driver.informationUri must be a string');
  assert.ok(Array.isArray(driver.rules), 'driver.rules must be an array');
});

// ---------------------------------------------------------------------------
// Test 5: results array has correct ruleId, level, message, locations
// ---------------------------------------------------------------------------
test('toSarif: results array has correct shape for both findings', () => {
  const sarif = toSarif(SYNTHETIC_RESULT);
  const results = sarif.runs[0].results;
  assert.ok(Array.isArray(results), 'results must be an array');
  assert.equal(results.length, 2, 'results must have 2 entries');

  // element-enriched finding
  const dangerResult = results.find((r) => r.level === 'error');
  assert.ok(dangerResult, 'danger finding must produce level:"error"');
  assert.equal(dangerResult.ruleId, 'andi/no-accessible-name',
    'ruleId must be "andi/no-accessible-name"');
  assert.ok(typeof dangerResult.message.text === 'string', 'message.text must be a string');
  assert.ok(Array.isArray(dangerResult.locations), 'locations must be an array');
  assert.ok(dangerResult.locations.length > 0, 'locations must have at least one entry');

  // element:null finding
  const warningResult = results.find((r) => r.level === 'warning');
  assert.ok(warningResult, 'warning finding must produce level:"warning"');
  assert.equal(warningResult.ruleId, 'andi/iframe-no-title',
    'ruleId must be "andi/iframe-no-title"');
  assert.ok(typeof warningResult.message.text === 'string', 'message.text must be a string');
  assert.ok(Array.isArray(warningResult.locations), 'locations must be an array');
});

// ---------------------------------------------------------------------------
// Test 6: severity level mapping
// ---------------------------------------------------------------------------
test('toSarif: severity maps correctly (danger→error, warning→warning, caution/info→note)', () => {
  const result = {
    findings: [
      { ...FINDING_WITH_ELEMENT, severity: 'danger', rule: 'rule-a' },
      { ...FINDING_WITH_ELEMENT, severity: 'warning', rule: 'rule-b' },
      { ...FINDING_WITH_ELEMENT, severity: 'caution', rule: 'rule-c' },
      { ...FINDING_WITH_ELEMENT, severity: 'info', rule: 'rule-d' },
    ],
    urls: ['https://example.com/'],
  };
  const sarif = toSarif(result);
  const results = sarif.runs[0].results;
  const find = (rule) => results.find((r) => r.ruleId === `andi/${rule}`);

  assert.equal(find('rule-a').level, 'error', 'danger → error');
  assert.equal(find('rule-b').level, 'warning', 'warning → warning');
  assert.equal(find('rule-c').level, 'note', 'caution → note');
  assert.equal(find('rule-d').level, 'note', 'info → note');
});

// ---------------------------------------------------------------------------
// Test 7: axe engine uses dequeuniversity helpUri
// ---------------------------------------------------------------------------
test('toSarif: axe engine findings get dequeuniversity helpUri', () => {
  const axeFinding = {
    engine: 'axe',
    module: 'focusable',
    severity: 'danger',
    rule: 'button-name',
    message: 'Button must have discernible text',
    wcag: ['4.1.2'],
    url: 'https://example.com/',
    element: {
      tag: 'button',
      html: '<button></button>',
      selector: '#btn-axe',
      andiIndex: null,
    },
  };
  const sarif = toSarif({ findings: [axeFinding] });
  const rule = sarif.runs[0].tool.driver.rules[0];
  assert.ok(rule.helpUri.includes('dequeuniversity.com'),
    `axe finding helpUri must include dequeuniversity.com, got: ${rule.helpUri}`);
});
