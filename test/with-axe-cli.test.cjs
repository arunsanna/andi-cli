'use strict';
/**
 * test/with-axe-cli.test.cjs — Task 3.3: --with-axe CLI wiring + reporter engine labels.
 *
 * Tests:
 *   T1: CLI --with-axe on focusable.html (text output) → stdout contains BOTH
 *       an [andi]-labeled finding AND an [axe]-labeled finding.
 *   T2: CLI --with-axe --json on focusable.html → JSON findings have both
 *       engine='andi' and engine='axe'; each finding object carries 'engine'.
 *   T3: CLI --with-axe --sarif (temp file) → SARIF ruleIds include 'andi/' prefix
 *       and 'axe/' prefix.
 *   T4 (reporter unit): toText of synthetic result with alsoFoundBy finding →
 *       shows [andi] tag + "also found by: axe" note.
 *   T5 (reporter unit): toText engine tag per finding — [andi] and [axe] appear.
 *   T6 (reporter unit): toHtml of synthetic result with alsoFoundBy finding →
 *       HTML contains engine badge text AND "also found by" note (escaped).
 *   T7 (reporter unit): toJunit of synthetic result with both engines →
 *       classname or name in testcase XML includes 'andi' or 'axe' identifier.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { toText } = require('../src/report/text.cjs');
const { toHtml } = require('../src/report/html.cjs');
const { toJunit } = require('../src/report/junit.cjs');

const { XMLParser } = require('fast-xml-parser');

const REPO = path.resolve(__dirname, '..');
const CLI = path.join(REPO, 'src', 'cli.cjs');
const FOCUSABLE_URL = 'file://' + path.join(REPO, 'test', 'fixtures', 'focusable.html');

// ---------------------------------------------------------------------------
// CLI helper
// ---------------------------------------------------------------------------
function runCli(args, { timeout = 30000 } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout,
  });
}

// ---------------------------------------------------------------------------
// T1: --with-axe text output contains both [andi] and [axe] labels
// ---------------------------------------------------------------------------
test('CLI --with-axe: text stdout contains [andi] label', async () => {
  const res = runCli(['--url', FOCUSABLE_URL, '--with-axe'], { timeout: 60000 });
  assert.ok(
    res.stdout.includes('[andi]'),
    `stdout must contain "[andi]" engine label.\nstdout:\n${res.stdout.slice(0, 2000)}`,
  );
});

test('CLI --with-axe: text stdout contains [axe] label', async () => {
  const res = runCli(['--url', FOCUSABLE_URL, '--with-axe'], { timeout: 60000 });
  assert.ok(
    res.stdout.includes('[axe]'),
    `stdout must contain "[axe]" engine label.\nstdout:\n${res.stdout.slice(0, 2000)}`,
  );
});

// ---------------------------------------------------------------------------
// T2: --with-axe --json output has both engine='andi' and engine='axe' findings
// ---------------------------------------------------------------------------
test('CLI --with-axe --json: findings contain engine=andi and engine=axe', async () => {
  const res = runCli(['--url', FOCUSABLE_URL, '--with-axe', '--json'], { timeout: 60000 });
  let report;
  assert.doesNotThrow(
    () => { report = JSON.parse(res.stdout); },
    `--json output must be valid JSON. stdout:\n${res.stdout.slice(0, 2000)}`,
  );
  const engines = new Set(report.findings.map((f) => f.engine));
  assert.ok(engines.has('andi'),
    `JSON findings must include engine='andi'. engines found: ${[...engines].join(', ')}`);
  assert.ok(engines.has('axe'),
    `JSON findings must include engine='axe'. engines found: ${[...engines].join(', ')}`);
  // Every finding must carry an 'engine' key
  for (const f of report.findings) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(f, 'engine'),
      `each finding must have an 'engine' key; finding: ${JSON.stringify(f)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// T3: --with-axe --sarif output has ruleIds with 'andi/' and 'axe/' prefixes
// ---------------------------------------------------------------------------
test('CLI --with-axe --sarif: ruleIds contain "andi/" and "axe/" prefixes', async () => {
  const sarifFile = path.join(os.tmpdir(), `andi-test-axe-${Date.now()}.sarif.json`);
  try {
    const res = runCli(
      ['--url', FOCUSABLE_URL, '--with-axe', '--sarif', sarifFile],
      { timeout: 60000 },
    );
    assert.ok(
      fs.existsSync(sarifFile),
      `--sarif must write file. stderr:\n${res.stderr}`,
    );
    const sarif = JSON.parse(fs.readFileSync(sarifFile, 'utf8'));
    const ruleIds = sarif.runs[0].results.map((r) => r.ruleId);
    const hasAndiRule = ruleIds.some((id) => id.startsWith('andi/'));
    const hasAxeRule = ruleIds.some((id) => id.startsWith('axe/'));
    assert.ok(hasAndiRule,
      `SARIF results must include a ruleId starting with 'andi/'. ruleIds: ${ruleIds.join(', ')}`);
    assert.ok(hasAxeRule,
      `SARIF results must include a ruleId starting with 'axe/'. ruleIds: ${ruleIds.join(', ')}`);
  } finally {
    try { fs.unlinkSync(sarifFile); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// Synthetic fixtures for reporter unit tests
// ---------------------------------------------------------------------------
const ANDI_FINDING_ALSO = {
  engine: 'andi',
  module: 'focusable',
  severity: 'danger',
  rule: 'no-accessible-name',
  message: 'Button has no accessible name',
  wcag: ['4.1.2'],
  alsoFoundBy: ['axe'],
  element: {
    tag: 'button',
    html: '<button></button>',
    selector: '#btn1',
    andiIndex: 1,
  },
};

const AXE_FINDING = {
  engine: 'axe',
  module: null,
  severity: 'danger',
  rule: 'button-name',
  message: 'Buttons must have an accessible name',
  wcag: ['4.1.2'],
  element: {
    tag: 'button',
    html: '<button></button>',
    selector: 'button',
    andiIndex: null,
  },
};

const SYNTHETIC_TWO_ENGINE_RESULT = {
  url: 'file:///test/fixtures/focusable.html',
  scannedAt: '2026-06-22T00:00:00.000Z',
  findings: [ANDI_FINDING_ALSO, AXE_FINDING],
  counts: { danger: 2, warning: 0, caution: 0, info: 0 },
  worst: 'danger',
  andiAlertTotal: null,
};

// ---------------------------------------------------------------------------
// T4: toText with alsoFoundBy finding shows "also found by: axe" note
// ---------------------------------------------------------------------------
test('toText: finding with alsoFoundBy shows "also found by: axe" note', () => {
  const text = toText(SYNTHETIC_TWO_ENGINE_RESULT);
  assert.ok(
    text.includes('also found by: axe') || text.includes('also found by axe'),
    `text output must include an "also found by: axe" note when alsoFoundBy=['axe'] is set.\noutput:\n${text}`,
  );
});

// ---------------------------------------------------------------------------
// T5: toText shows [andi] and [axe] engine tags per finding
// ---------------------------------------------------------------------------
test('toText: finding with engine=andi shows [andi] tag', () => {
  const text = toText(SYNTHETIC_TWO_ENGINE_RESULT);
  assert.ok(
    text.includes('[andi]'),
    `text output must include "[andi]" engine tag.\noutput:\n${text}`,
  );
});

test('toText: finding with engine=axe shows [axe] tag', () => {
  const text = toText(SYNTHETIC_TWO_ENGINE_RESULT);
  assert.ok(
    text.includes('[axe]'),
    `text output must include "[axe]" engine tag.\noutput:\n${text}`,
  );
});

// ---------------------------------------------------------------------------
// T6: toHtml with alsoFoundBy finding shows engine badge + "also found by" note
// ---------------------------------------------------------------------------
test('toHtml: finding with engine=andi shows engine badge in HTML', () => {
  const html = toHtml(SYNTHETIC_TWO_ENGINE_RESULT);
  assert.ok(
    html.includes('andi') && html.toLowerCase().includes('engine'),
    `HTML must show the andi engine label in a badge or metadata.\noutput (first 3000 chars):\n${html.slice(0, 3000)}`,
  );
});

test('toHtml: finding with alsoFoundBy shows "also found by" note', () => {
  const html = toHtml(SYNTHETIC_TWO_ENGINE_RESULT);
  assert.ok(
    html.toLowerCase().includes('also found by'),
    `HTML must include "also found by" note for cross-engine findings.\noutput (first 3000 chars):\n${html.slice(0, 3000)}`,
  );
});

// ---------------------------------------------------------------------------
// T7: toJunit with both engines → classname or name distinguishes engines
// ---------------------------------------------------------------------------
test('toJunit: testcase for engine=andi finding includes andi in classname or name', () => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    isArray: (name) => ['testsuite', 'testcase'].includes(name),
  });

  const xml = toJunit(SYNTHETIC_TWO_ENGINE_RESULT, 3);
  const parsed = parser.parse(xml);
  const suites = parsed.testsuites.testsuite;
  const allCases = suites.flatMap((s) => s.testcase || []);

  const hasAndiLabel = allCases.some(
    (tc) =>
      (tc['@_classname'] || '').includes('andi') ||
      (tc['@_name'] || '').includes('andi'),
  );
  assert.ok(
    hasAndiLabel,
    `At least one testcase must include 'andi' in classname or name.\ncases: ${JSON.stringify(allCases.map((tc) => ({ name: tc['@_name'], classname: tc['@_classname'] })))}`,
  );
});

test('toJunit: testcase for engine=axe finding includes axe in classname or name', () => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    isArray: (name) => ['testsuite', 'testcase'].includes(name),
  });

  const xml = toJunit(SYNTHETIC_TWO_ENGINE_RESULT, 3);
  const parsed = parser.parse(xml);
  const suites = parsed.testsuites.testsuite;
  const allCases = suites.flatMap((s) => s.testcase || []);

  const hasAxeLabel = allCases.some(
    (tc) =>
      (tc['@_classname'] || '').includes('axe') ||
      (tc['@_name'] || '').includes('axe'),
  );
  assert.ok(
    hasAxeLabel,
    `At least one testcase must include 'axe' in classname or name.\ncases: ${JSON.stringify(allCases.map((tc) => ({ name: tc['@_name'], classname: tc['@_classname'] })))}`,
  );
});
