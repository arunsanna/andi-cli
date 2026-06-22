'use strict';
/**
 * test/version.test.cjs — Validation V11
 *
 * Assert that the scanner-exposed `andiVersion` equals the version embedded
 * in `andi/andi.js` (grep `var andiVersionNumber = "X"`).
 *
 * This catches a future upstream bump where the scanner was NOT updated to
 * read the new version string.  Run after every `git merge upstream`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scan } = require('../src/scanner.cjs');

const REPO = path.resolve(__dirname, '..');
const FIXTURE_URL = 'file://' + path.join(REPO, 'examples', 'fixture.html');

// ---------------------------------------------------------------------------
// Parse the version string directly from andi/andi.js — ground truth.
// ---------------------------------------------------------------------------
function parseAndiVersion() {
  const src = fs.readFileSync(path.join(REPO, 'andi', 'andi.js'), 'utf8');
  const m = src.match(/var\s+andiVersionNumber\s*=\s*"([^"]+)"/);
  assert.ok(m, 'Could not find `var andiVersionNumber = "..."` in andi/andi.js');
  return m[1];
}

const EXPECTED_VERSION = parseAndiVersion();

// ---------------------------------------------------------------------------
// V11-A: scan result exposes andiVersion field
// ---------------------------------------------------------------------------
test('V11: scan result exposes andiVersion field (not null)', async () => {
  const result = await scan(FIXTURE_URL, { headless: true });
  assert.ok(
    result.andiVersion !== undefined,
    'scan result must have an andiVersion field'
  );
  assert.notEqual(
    result.andiVersion,
    null,
    `andiVersion must not be null; scanner must read window.andiVersionNumber`
  );
  assert.equal(
    typeof result.andiVersion,
    'string',
    `andiVersion must be a string, got ${typeof result.andiVersion}`
  );
});

// ---------------------------------------------------------------------------
// V11-B: scanner-reported andiVersion matches andi/andi.js source (must be "29.2.2" today)
// ---------------------------------------------------------------------------
test('V11: scanner andiVersion matches version in andi/andi.js', async () => {
  const result = await scan(FIXTURE_URL, { headless: true });
  assert.equal(
    result.andiVersion,
    EXPECTED_VERSION,
    `scanner reported andiVersion="${result.andiVersion}" but andi/andi.js declares "${EXPECTED_VERSION}"`
  );
});

// ---------------------------------------------------------------------------
// V11-C: JSON report includes andiVersion field (additive — existing fields unchanged)
// ---------------------------------------------------------------------------
test('V11: JSON report includes andiVersion field alongside existing version field', () => {
  const { toJson } = require('../src/report/json.cjs');
  const syntheticResult = {
    url: 'https://example.com/',
    scannedAt: '2026-06-22T00:00:00.000Z',
    andiVersion: EXPECTED_VERSION,
    findings: [],
    counts: { danger: 0, warning: 0, caution: 0, info: 0 },
    worst: null,
    andiAlertTotal: 0,
  };
  const report = toJson(syntheticResult);

  // New field: andiVersion
  assert.ok(
    Object.prototype.hasOwnProperty.call(report, 'andiVersion'),
    'JSON report must include andiVersion field'
  );
  assert.equal(
    report.andiVersion,
    EXPECTED_VERSION,
    `JSON report andiVersion must equal EXPECTED_VERSION "${EXPECTED_VERSION}"`
  );

  // Existing field: version (npm package version — must NOT be removed)
  assert.ok(
    Object.prototype.hasOwnProperty.call(report, 'version'),
    'JSON report must still include the existing "version" (npm package) field'
  );
  assert.match(
    report.version,
    /^\d+\.\d+\.\d+/,
    `version must be semver-like, got "${report.version}"`
  );

  // They must be distinct objects: andiVersion is ANDI's version, version is npm
  // (unless the user has miraculously bumped npm to exactly match ANDI, but they
  // describe different things — andi-cli package vs andi.js release).
  assert.notEqual(
    report.andiVersion,
    report.version,
    'andiVersion (ANDI release) must differ from version (andi-cli npm) — they describe different things'
  );
});
