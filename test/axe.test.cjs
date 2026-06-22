'use strict';
/**
 * test/axe.test.cjs — axe engine adapter (Task 3.1).
 *
 * Validates:
 *   V8a: runAxe on focusable.html → ≥1 finding, engine='axe', module=null,
 *        no element referencing ANDI508 UI (ANDI not injected here).
 *   V8b: WCAG tag transform: wcag412→'4.1.2', wcag1411→'4.1.11', wcag2a excluded.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');
const { runAxe } = require('../src/engines/axe.cjs');

const REPO = path.resolve(__dirname, '..');
const FOCUSABLE_URL = 'file://' + path.join(REPO, 'test', 'fixtures', 'focusable.html');

let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
});

// ---------------------------------------------------------------------------
// V8a — axe on focusable.html (pristine DOM, no ANDI injection)
// ---------------------------------------------------------------------------

test('axe: runAxe on focusable.html returns ≥1 finding', async () => {
  const findings = await runAxe(browser, FOCUSABLE_URL);
  assert.ok(
    findings.length >= 1,
    `expected ≥1 axe finding on focusable.html, got ${findings.length}`
  );
});

test('axe: every finding has engine="axe"', async () => {
  const findings = await runAxe(browser, FOCUSABLE_URL);
  for (const f of findings) {
    assert.equal(f.engine, 'axe', `finding.engine must be "axe", got ${f.engine}`);
  }
});

test('axe: every finding has module=null', async () => {
  const findings = await runAxe(browser, FOCUSABLE_URL);
  for (const f of findings) {
    assert.strictEqual(f.module, null, `finding.module must be null, got ${f.module}`);
  }
});

test('axe: no finding references an #ANDI508 element (pristine DOM)', async () => {
  const findings = await runAxe(browser, FOCUSABLE_URL);
  for (const f of findings) {
    const html = f.element ? f.element.html || '' : '';
    const selector = f.element ? f.element.selector || '' : '';
    assert.ok(
      !html.includes('ANDI508') && !selector.includes('ANDI508'),
      `finding must not reference ANDI UI element; html="${html}" selector="${selector}"`
    );
  }
});

// ---------------------------------------------------------------------------
// V8b — WCAG tag transform (criterion codes only, level tags excluded)
// ---------------------------------------------------------------------------

test('axe: wcag tag transform: wcag412 → "4.1.2"', () => {
  // Exercise the transform directly: wcag412 is a 3-digit criterion code
  // (1 major + 2 minor digits).
  const { _transformWcagTag } = require('../src/engines/axe.cjs');
  assert.equal(_transformWcagTag('wcag412'), '4.1.2');
});

test('axe: wcag tag transform: wcag1411 → "1.4.11"', () => {
  // WCAG 2.1 SC 1.4.11 (Non-text Contrast): tag wcag1411 → '1.4.11'
  // d = '1411': d[0]='1' (major), d[1]='4' (minor-major), d.slice(2)='11' (minor-minor)
  const { _transformWcagTag } = require('../src/engines/axe.cjs');
  assert.equal(_transformWcagTag('wcag1411'), '1.4.11');
});

test('axe: wcag level tags (wcag2a, wcag2aa) are excluded from findings', async () => {
  const findings = await runAxe(browser, FOCUSABLE_URL);
  for (const f of findings) {
    for (const w of f.wcag) {
      // All wcag entries must look like digits.digits.digits — not raw tag strings
      assert.match(
        w,
        /^\d+\.\d+\.\d+$/,
        `wcag entry "${w}" must be in N.N.N form (level tags like wcag2a must be excluded)`
      );
    }
  }
});
