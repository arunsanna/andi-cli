'use strict';
/**
 * test/axe-merge.test.cjs — Task 3.2: axe findings merged into aggregate.
 *
 * Validation V8 (merge):
 *   V8-1: scan with withAxe:true → findings contain BOTH engine='andi'
 *         AND engine='axe' findings; counts/worst reflect both engines.
 *   V8-2: cross-engine collision unit test — aggregate([andiArr, axeArr])
 *         with same-element different-rule → BOTH present; andi tagged alsoFoundBy:['axe'].
 *   V8-3: scan without withAxe (default path) → NO engine='axe' findings.
 *
 * Default-path isolation: withAxe is never set → runAxe is never imported/called.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const FOCUSABLE_URL = 'file://' + path.join(REPO, 'test', 'fixtures', 'focusable.html');

const { scan } = require('../src/scanner.cjs');
const { aggregate } = require('../src/aggregate.cjs');

// ---------------------------------------------------------------------------
// V8-2: Cross-engine collision unit test — pure aggregate() call
// No browser needed; synthetic findings.
// ---------------------------------------------------------------------------

test('axe-merge: aggregate cross-engine collision keeps both; andi tagged alsoFoundBy', () => {
  const el = {
    tag: 'button',
    html: '<button id="btn-x"></button>',
    selector: '#btn-x',
    andiIndex: 1,
  };
  const andiF = {
    engine: 'andi',
    module: 'focusable',
    severity: 'danger',
    rule: 'no-accessible-name',
    message: 'Missing accessible name',
    wcag: ['4.1.2'],
    element: el,
  };
  const axeF = {
    engine: 'axe',
    module: null,
    severity: 'critical',
    rule: 'button-name',
    message: 'Buttons must have an accessible name',
    wcag: ['4.1.2'],
    element: el,
  };

  const result = aggregate([[andiF], [axeF]]);

  // Both findings kept
  assert.equal(
    result.findings.length,
    2,
    `Expected 2 findings (cross-engine kept), got ${result.findings.length}: ${JSON.stringify(result.findings)}`
  );

  const andiFinding = result.findings.find((f) => f.engine === 'andi');
  const axeFinding = result.findings.find((f) => f.engine === 'axe');

  assert.ok(andiFinding, 'andi finding must be present in cross-engine collision');
  assert.ok(axeFinding, 'axe finding must be present in cross-engine collision');

  // andi tagged
  assert.ok(
    Array.isArray(andiFinding.alsoFoundBy) && andiFinding.alsoFoundBy.includes('axe'),
    `andi finding must have alsoFoundBy:['axe'], got: ${JSON.stringify(andiFinding.alsoFoundBy)}`
  );
  // axe NOT tagged
  assert.ok(
    !axeFinding.alsoFoundBy || !axeFinding.alsoFoundBy.includes('andi'),
    'axe finding must not carry alsoFoundBy:andi'
  );
});

// ---------------------------------------------------------------------------
// V8-1: scan with withAxe:true → both engines present in result
// ---------------------------------------------------------------------------

test('axe-merge: scan with withAxe:true produces engine=andi AND engine=axe findings', async () => {
  const result = await scan(FOCUSABLE_URL, { modules: 'f', withAxe: true });

  const hasAndi = result.findings.some((f) => f.engine === 'andi');
  const hasAxe = result.findings.some((f) => f.engine === 'axe');

  assert.ok(
    hasAndi,
    `Expected ≥1 engine='andi' finding; got findings: ${JSON.stringify(result.findings.map((f) => f.engine))}`
  );
  assert.ok(
    hasAxe,
    `Expected ≥1 engine='axe' finding; got findings: ${JSON.stringify(result.findings.map((f) => f.engine))}`
  );

  // counts and worst reflect merged results (total > 0)
  const total = result.counts.danger + result.counts.warning + result.counts.caution + result.counts.info;
  assert.ok(total > 0, `counts total must be > 0 when both engines run; got ${JSON.stringify(result.counts)}`);
  assert.ok(result.worst !== null, `worst must not be null when findings exist; got ${result.worst}`);
});

// ---------------------------------------------------------------------------
// V8-3: Default path (no withAxe) — MUST produce zero engine='axe' findings
// ---------------------------------------------------------------------------

test('axe-merge: scan without withAxe has no engine=axe findings (default path unchanged)', async () => {
  const result = await scan(FOCUSABLE_URL, { modules: 'f' });

  const axeFindings = result.findings.filter((f) => f.engine === 'axe');
  assert.equal(
    axeFindings.length,
    0,
    `Default scan must produce 0 axe findings, got ${axeFindings.length}: ${JSON.stringify(axeFindings)}`
  );

  // ANDI findings must still be present (default path not broken)
  const andiFindings = result.findings.filter((f) => f.engine === 'andi');
  assert.ok(
    andiFindings.length >= 1,
    `Default scan must still produce ≥1 andi finding, got ${andiFindings.length}`
  );
});
