'use strict';
/**
 * Tests for src/modules.cjs — MODULES registry + scanModule().
 *
 * RED phase: fails until modules.cjs exists.
 *
 * Fixture: examples/multi-module-fixture.html plants
 *   - contrast (c): low-contrast text/button
 *   - tables  (t): data table without header cells / caption
 *   - focusable (f): buttons/links with no accessible name
 *   - graphics (g): image with no alt
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');
const { MODULES, scanModule } = require('../src/modules.cjs');

const REPO = path.resolve(__dirname, '..');
const MULTI_URL = 'file://' + path.join(REPO, 'examples', 'multi-module-fixture.html');

// ---------------------------------------------------------------------------
// MODULES registry smoke-check (pure, no browser needed)
// ---------------------------------------------------------------------------
test('MODULES registry contains required keys', () => {
  const REQUIRED = ['f', 'g', 'l', 't', 's', 'c', 'h', 'i'];
  for (const key of REQUIRED) {
    assert.ok(key in MODULES, `MODULES missing key "${key}"`);
    assert.ok(typeof MODULES[key] === 'string' && MODULES[key].length > 0,
      `MODULES["${key}"] must be a non-empty string`);
  }
  assert.equal(MODULES.f, 'focusable');
  assert.equal(MODULES.c, 'contrast');
  assert.equal(MODULES.t, 'tables');
  assert.equal(MODULES.g, 'graphics');
  assert.equal(MODULES.l, 'links');
});

// ---------------------------------------------------------------------------
// scanModule — contrast module finds low-contrast violation
// ---------------------------------------------------------------------------
test('scanModule contrast: >=1 finding, all module=contrast, message mentions contrast', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, MULTI_URL, 'c');

    assert.ok(
      findings.length >= 1,
      `Expected >=1 contrast findings, got ${findings.length}`
    );
    for (const f of findings) {
      assert.equal(f.module, 'contrast',
        `All findings must have module="contrast", got "${f.module}"`);
      assert.equal(f.engine, 'andi', 'engine must be "andi"');
    }
    const hasContrastMsg = findings.some(
      (f) => /contrast/i.test(f.message) || f.rule === 'low-contrast'
    );
    assert.ok(hasContrastMsg,
      `Expected at least one finding mentioning contrast. Got: ${JSON.stringify(findings.map((f) => f.message))}`
    );
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// scanModule — tables module finds table-headers violation
// ---------------------------------------------------------------------------
test('scanModule tables: >=1 finding, all module=tables, message mentions table/header', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, MULTI_URL, 't');

    assert.ok(
      findings.length >= 1,
      `Expected >=1 tables findings, got ${findings.length}`
    );
    for (const f of findings) {
      assert.equal(f.module, 'tables',
        `All findings must have module="tables", got "${f.module}"`);
      assert.equal(f.engine, 'andi', 'engine must be "andi"');
    }
    const hasTableMsg = findings.some(
      (f) => /table|header|th|caption/i.test(f.message) || f.rule === 'table-no-headers'
    );
    assert.ok(hasTableMsg,
      `Expected at least one finding mentioning table/header. Got: ${JSON.stringify(findings.map((f) => f.message))}`
    );
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// scanModule — graphics module must not leak the default focusable alerts
// ---------------------------------------------------------------------------
test('scanModule graphics: activates gANDI and does not return focusable alerts', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, MULTI_URL, 'g');

    assert.ok(
      findings.length >= 1,
      `Expected >=1 graphics findings, got ${findings.length}`
    );
    for (const f of findings) {
      assert.equal(f.module, 'graphics',
        `All findings must have module="graphics", got "${f.module}"`);
      assert.equal(f.engine, 'andi', 'engine must be "andi"');
    }
    const leakedFocusable = findings.filter((f) =>
      /Button has no accessible name|Link has no accessible name/i.test(f.message)
    );
    assert.deepEqual(
      leakedFocusable,
      [],
      `Graphics scan leaked focusable alerts: ${JSON.stringify(leakedFocusable)}`
    );
    const hasGraphicsMsg = findings.some(
      (f) => /alt|image|img|decorative|graphics/i.test(f.message)
    );
    assert.ok(
      hasGraphicsMsg,
      `Expected at least one graphics/image finding. Got: ${JSON.stringify(findings.map((f) => f.message))}`
    );
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// DETERMINISM (Decision 5 / eval V5): fresh context per call → stable counts
// ---------------------------------------------------------------------------
test('scanModule determinism: contrast count identical across 3 consecutive calls', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const { findings } = await scanModule(browser, MULTI_URL, 'c');
      runs.push(findings.length);
    }
    assert.equal(runs[0], runs[1],
      `Run 1 count ${runs[0]} !== run 2 count ${runs[1]}`);
    assert.equal(runs[1], runs[2],
      `Run 2 count ${runs[1]} !== run 3 count ${runs[2]}`);
  } finally {
    await browser.close();
  }
});
