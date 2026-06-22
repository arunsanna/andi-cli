'use strict';
/**
 * Tests for src/extract.cjs — alerts-list-primary extraction → Finding[].
 *
 * RED phase: both tests must fail until extract.cjs exists.
 *
 * Grounding (spikes/05, spikes/06, live DOM probe 2026-06-21):
 *   - Alert↔element link: data-andi508-relatedindex on the <a> inside each
 *     alert-list li  ↔  data-andi508-index on the flagged page element.
 *   - s/h/i modules emit zero .ANDI508-element-* flags → element: null.
 *   - When launchModule() is called after initial load, #ANDI508-alerts-list
 *     gets a second #ANDI508-alerts-container appended; use the LAST one.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');
const { installVendorRoutes, ANDI_DIR, JQUERY } = require('../src/vendor-route.cjs');
const { extractFindings } = require('../src/extract.cjs');

const REPO = path.resolve(__dirname, '..');
const FIXTURE_URL = 'file://' + path.join(REPO, 'examples', 'fixture.html');

/** Shared ANDI injection + stable-wait helper. */
async function loadAndi(page, url) {
  await installVendorRoutes(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: JQUERY });
  await page.addScriptTag({ path: path.join(ANDI_DIR, 'andi.js') });
  await page.waitForFunction(
    () =>
      !!window.andiVersionNumber &&
      !!document.getElementById('ANDI508') &&
      !!window.testPageData &&
      typeof window.testPageData.numberOfAccessibilityAlertsFound === 'number',
    { timeout: 30000 }
  );
  await page.waitForFunction(
    () => {
      const l = document.getElementById('ANDI508-alerts-list');
      const sig =
        (l ? l.innerHTML.length : 0) +
        ':' +
        (window.testPageData && window.testPageData.numberOfAccessibilityAlertsFound);
      window.__andiStable = window.__andiStable || { v: null, n: 0 };
      if (window.__andiStable.v === sig) {
        window.__andiStable.n++;
      } else {
        window.__andiStable.v = sig;
        window.__andiStable.n = 0;
      }
      return window.__andiStable.n >= 3;
    },
    { timeout: 12000, polling: 250 }
  );
}

// ---------------------------------------------------------------------------
// Path 1: ELEMENT-ENRICHED — focusable module on fixture.html
// Expects exactly 2 findings, each with element != null.
// ---------------------------------------------------------------------------
test('extractFindings (focusable): 2 danger findings with element attachment', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();

    await loadAndi(page, FIXTURE_URL);

    const findings = await extractFindings(page, 'f');

    assert.equal(
      findings.length,
      2,
      `Expected 2 findings for focusable fixture, got ${findings.length}: ${JSON.stringify(findings)}`
    );

    for (const f of findings) {
      assert.equal(f.engine, 'andi', 'engine must be "andi"');
      assert.equal(f.module, 'focusable', 'module must be "focusable"');
      assert.equal(f.severity, 'danger', `severity must be "danger", got "${f.severity}"`);
      assert.ok(f.message && f.message.length > 0, 'message must be non-empty');
      assert.equal(f.rule, 'no-accessible-name', `rule must be "no-accessible-name", got "${f.rule}"`);
      assert.deepEqual(f.wcag, ['4.1.2'], `wcag must be ["4.1.2"], got ${JSON.stringify(f.wcag)}`);
      assert.ok(f.element !== null, 'element must not be null for focusable module');
      assert.ok(
        f.element && f.element.html && f.element.html.length > 0,
        `element.html must be non-empty, got: ${JSON.stringify(f.element)}`
      );
    }

    await ctx.close();
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// Path 2: ELEMENT-NULL — iframes module on inline iframe page
// Proves that s/h/i findings have element: null (amended Decision 4).
// ---------------------------------------------------------------------------
test('extractFindings (iframes): element: null for page-level alert', async () => {
  const fs = require('fs');
  const iframeHtml =
    '<!doctype html><html lang=en><head><meta charset=utf-8><title>i</title></head>' +
    '<body><h1>i</h1><iframe src="about:blank"></iframe></body></html>';
  const tmpFile = '/tmp/andi-extract-iframe-test.html';
  fs.writeFileSync(tmpFile, iframeHtml);

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();

    await loadAndi(page, 'file://' + tmpFile);

    // Switch to iframes module after initial (focusable) load.
    await page.evaluate(() => {
      window.__andiStable = null;
      window.AndiModule.launchModule('i');
    });
    // Re-wait for stable after module switch.
    await page.waitForFunction(
      () => {
        const l = document.getElementById('ANDI508-alerts-list');
        const sig =
          (l ? l.innerHTML.length : 0) +
          ':' +
          (window.testPageData && window.testPageData.numberOfAccessibilityAlertsFound);
        window.__andiStable = window.__andiStable || { v: null, n: 0 };
        if (window.__andiStable.v === sig) {
          window.__andiStable.n++;
        } else {
          window.__andiStable.v = sig;
          window.__andiStable.n = 0;
        }
        return window.__andiStable.n >= 3;
      },
      { timeout: 12000, polling: 250 }
    );

    const findings = await extractFindings(page, 'i');

    assert.ok(
      findings.length >= 1,
      `Expected >= 1 iframe finding, got ${findings.length}`
    );

    const iframeFinding = findings.find(
      (f) => f.module === 'iframes' && /no accessible name/i.test(f.message)
    );
    assert.ok(
      iframeFinding,
      `Expected a finding with module='iframes' and message containing "no accessible name", got: ${JSON.stringify(findings)}`
    );
    assert.strictEqual(
      iframeFinding.element,
      null,
      `element must be null for iframes module finding, got: ${JSON.stringify(iframeFinding.element)}`
    );
    assert.equal(iframeFinding.engine, 'andi', 'engine must be "andi"');

    await ctx.close();
  } finally {
    await browser.close();
  }
});
