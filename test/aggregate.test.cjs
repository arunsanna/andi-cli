'use strict';
/**
 * Tests for src/aggregate.cjs — merge findings across modules/engines.
 *
 * RED phase: all tests must fail until aggregate.cjs exists.
 *
 * Finding shape:
 *   { engine:'andi'|'axe', module:string|null, severity:'danger'|'warning'|'caution'|'info',
 *     rule:string, message:string, wcag:string[]|null,
 *     element:{tag,html,selector,andiIndex}|null }
 *
 * De-dup sig: `${f.module||'_'}|${f.rule}|${elementKey}`
 *   where elementKey = f.element ? (f.element.selector || f.element.html) : f.message
 *   (element is null for s/h/i findings; falling back to message prevents a null-deref throw)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src/aggregate.cjs');

// ---------------------------------------------------------------------------
// Helper: build a minimal Finding object.
// ---------------------------------------------------------------------------
function mkFinding({ engine = 'andi', module: mod = 'focusable', severity = 'danger',
  rule = 'no-accessible-name', message = 'Missing accessible name',
  wcag = ['4.1.2'], element = null } = {}) {
  return { engine, module: mod, severity, rule, message, wcag, element };
}

function mkElement(selector = '#btn1', html = '<button id="btn1">x</button>') {
  return { tag: 'button', html, selector, andiIndex: 1 };
}

// ---------------------------------------------------------------------------
// Test 1: intra-engine exact duplicate is dropped; counts and worst are correct
// ---------------------------------------------------------------------------
test('aggregate: intra-engine duplicate is dropped, counts and worst correct', () => {
  const el = mkElement('#btn1');
  const f1 = mkFinding({ engine: 'andi', module: 'focusable', severity: 'danger',
    rule: 'no-accessible-name', element: el });
  const f2 = mkFinding({ engine: 'andi', module: 'focusable', severity: 'danger',
    rule: 'no-accessible-name', element: el }); // exact dup of f1
  const f3 = mkFinding({ engine: 'andi', module: 'links', severity: 'warning',
    rule: 'ambiguous-link', message: 'Link text is ambiguous',
    element: mkElement('#lnk', '<a id="lnk">more</a>') });

  const result = aggregate([[f1, f2], [f3]]);

  // dup dropped → 2 findings total
  assert.equal(result.findings.length, 2,
    `Expected 2 findings (dup dropped), got ${result.findings.length}: ${JSON.stringify(result.findings)}`);

  // counts
  assert.equal(result.counts.danger, 1, 'counts.danger must be 1');
  assert.equal(result.counts.warning, 1, 'counts.warning must be 1');
  assert.equal(result.counts.caution, 0, 'counts.caution must be 0');
  assert.equal(result.counts.info, 0, 'counts.info must be 0');

  // worst
  assert.equal(result.worst, 'danger', `worst must be "danger", got "${result.worst}"`);

  // sort: danger before warning
  assert.equal(result.findings[0].severity, 'danger', 'first finding must be danger');
  assert.equal(result.findings[1].severity, 'warning', 'second finding must be warning');
});

// ---------------------------------------------------------------------------
// Test 2: element:null finding (e.g. iframes module) handled without throwing,
//         and deduplication works via message fallback.
// ---------------------------------------------------------------------------
test('aggregate: element:null finding handled without throw; dedup via message', () => {
  // s/h/i findings have element: null
  const f1 = mkFinding({ engine: 'andi', module: 'iframes', severity: 'warning',
    rule: 'iframe-no-name', message: 'Iframe has no accessible name',
    element: null });
  const f2 = mkFinding({ engine: 'andi', module: 'iframes', severity: 'warning',
    rule: 'iframe-no-name', message: 'Iframe has no accessible name',
    element: null }); // exact dup — should be dropped

  let result;
  assert.doesNotThrow(() => {
    result = aggregate([[f1, f2]]);
  }, 'aggregate must not throw when element is null');

  assert.equal(result.findings.length, 1,
    `Expected 1 finding (null-element dup dropped), got ${result.findings.length}`);
  assert.equal(result.findings[0].element, null, 'element must remain null');
  assert.equal(result.counts.warning, 1, 'counts.warning must be 1');
  assert.equal(result.worst, 'warning', 'worst must be "warning"');
});

// ---------------------------------------------------------------------------
// Test 3: cross-engine collision — andi + axe on same element, different rule
//         → BOTH kept; andi finding tagged alsoFoundBy:['axe']
// ---------------------------------------------------------------------------
test('aggregate: cross-engine collision keeps both findings; andi tagged alsoFoundBy', () => {
  const el = mkElement('#img1', '<img id="img1" src="x.png">');
  const andiF = mkFinding({ engine: 'andi', module: 'graphics', severity: 'danger',
    rule: 'graphic-no-name', message: 'Image missing alt text', element: el });
  const axeF = mkFinding({ engine: 'axe', module: 'graphics', severity: 'danger',
    rule: 'image-alt', message: 'Image elements must have an alt attribute', element: el });

  const result = aggregate([[andiF], [axeF]]);

  // Both findings must be present
  assert.equal(result.findings.length, 2,
    `Expected 2 findings (cross-engine kept), got ${result.findings.length}: ${JSON.stringify(result.findings)}`);

  const andiFinding = result.findings.find((f) => f.engine === 'andi');
  const axeFinding = result.findings.find((f) => f.engine === 'axe');

  assert.ok(andiFinding, 'andi finding must be present');
  assert.ok(axeFinding, 'axe finding must be present');

  // andi finding must be tagged
  assert.ok(
    Array.isArray(andiFinding.alsoFoundBy) && andiFinding.alsoFoundBy.includes('axe'),
    `andi finding must have alsoFoundBy:['axe'], got: ${JSON.stringify(andiFinding.alsoFoundBy)}`
  );
  // axe finding must NOT be tagged (only andi gets the tag)
  assert.ok(
    !axeFinding.alsoFoundBy || !axeFinding.alsoFoundBy.includes('andi'),
    'axe finding must not be tagged alsoFoundBy andi'
  );
});

// ---------------------------------------------------------------------------
// Test 4: empty input → worst is null, counts all 0, findings empty
// ---------------------------------------------------------------------------
test('aggregate: empty input yields null worst and zero counts', () => {
  const result = aggregate([]);

  assert.equal(result.worst, null, `worst must be null for empty input, got "${result.worst}"`);
  assert.equal(result.counts.danger, 0, 'counts.danger must be 0');
  assert.equal(result.counts.warning, 0, 'counts.warning must be 0');
  assert.equal(result.counts.caution, 0, 'counts.caution must be 0');
  assert.equal(result.counts.info, 0, 'counts.info must be 0');
  assert.equal(result.findings.length, 0, 'findings must be empty');
});

// ---------------------------------------------------------------------------
// Test 5: empty arrays in input → same as no input
// ---------------------------------------------------------------------------
test('aggregate: arrays of empty arrays yields null worst and zero counts', () => {
  const result = aggregate([[], [], []]);
  assert.equal(result.worst, null, 'worst must be null');
  assert.equal(result.findings.length, 0, 'findings must be empty');
});
