'use strict';
/**
 * test/live-url.test.cjs — live-target (http://) scanning tests.
 *
 * Proves the vendor-router fix: the default mode lets the target page
 * load normally (route.continue()) so ANDI can scan its real DOM. Uses
 * a local http.createServer as a stand-in for a live target — no public
 * internet required.
 *
 * Tests:
 *   1. DEFAULT mode (strictOffline=false): scanModule against a local
 *      http server that serves a page with a planted <button></button>
 *      (no accessible name → danger). The router must continue() the
 *      navigation and ANDI must find ≥1 danger finding. This is the
 *      key regression test for the ERR_BLOCKED_BY_CLIENT fix.
 *
 *   2. strictOffline=true: same http server, but the router is asked to
 *      block non-ANDI/non-jQuery requests. The scan must either throw an
 *      error (page fails to load) or produce externalAttempts.length > 0
 *      (the navigation attempt was recorded before aborting). Either
 *      outcome proves the strictOffline path blocks the target page.
 *
 *   3. Regression: file:// fixture still finds 2 dangers with default
 *      (strictOffline=false) installVendorRoutes.
 *
 * Note: scanModule / installVendorRoutes do NOT hit the public internet.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { scanModule } = require('../src/modules.cjs');
const { installVendorRoutes } = require('../src/vendor-route.cjs');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = 'file://' + path.join(REPO, 'examples', 'fixture.html');
const ANDI_DIR = path.join(REPO, 'andi');
const JQUERY = path.join(REPO, 'src', 'vendor', 'jquery-3.7.1.min.js');

/** Minimal HTML page with one planted danger: <button> with no accessible name. */
const PLANTED_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Live target</title></head>
<body>
  <h1>Test</h1>
  <button></button><!-- planted: no accessible name → focusable danger -->
</body>
</html>`;

/** Spin up an http.createServer that serves PLANTED_HTML on every request. */
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(PLANTED_HTML);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Test 1: DEFAULT mode (no strictOffline) — live http target loads + ANDI finds danger
// ---------------------------------------------------------------------------

test('live-url: default mode — scanModule loads http://127.0.0.1 and finds planted danger', async () => {
  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ headless: true });
  try {
    // No strictOffline → router must continue() the navigation to the local server.
    const { findings, externalAttempts } = await scanModule(browser, url, 'f');

    // The page loaded and ANDI ran: expect ≥1 danger finding from the planted <button>
    const dangers = findings.filter((f) => f.severity === 'danger');
    assert.ok(
      dangers.length >= 1,
      `Expected ≥1 danger finding from planted <button></button>, got ${dangers.length}. ` +
      `externalAttempts: ${JSON.stringify(externalAttempts)}. ` +
      `All findings: ${JSON.stringify(findings.map((f) => ({ sev: f.severity, msg: f.message })))}`
    );
  } finally {
    await browser.close();
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Test 2: strictOffline=true — same http target is BLOCKED
// ---------------------------------------------------------------------------

test('live-url: strictOffline=true — http://127.0.0.1 navigation is blocked', async () => {
  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ headless: true });
  let scanError = null;
  let externalAttempts = [];

  try {
    // strictOffline=true → router must abort() the navigation to the local server.
    const result = await scanModule(browser, url, 'f', { strictOffline: true }).catch((e) => {
      scanError = e;
      return null;
    });
    if (result) {
      externalAttempts = result.externalAttempts || [];
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Either the scan threw (page failed to load under block) OR
  // externalAttempts is non-empty (the http request was recorded before abort).
  // Both outcomes prove the strictOffline path blocks the target.
  const wasBlocked = scanError !== null || externalAttempts.length > 0;
  assert.ok(
    wasBlocked,
    `Expected scan to be blocked (error or externalAttempts > 0) with strictOffline=true. ` +
    `scanError: ${scanError && scanError.message}, ` +
    `externalAttempts: ${JSON.stringify(externalAttempts)}`
  );
});

// ---------------------------------------------------------------------------
// Test 3: Regression — file:// fixture still finds 2 dangers (default mode)
// ---------------------------------------------------------------------------

test('live-url: regression — file:// fixture still finds 2 dangers with default vendor routes', async () => {
  const browser = await chromium.launch({ headless: true });
  const { injectAndi, waitAndiReady, waitModuleStable } = require('../src/andi-helpers.cjs');
  try {
    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();

    // Default installVendorRoutes (strictOffline=false)
    const { externalAttempts } = await installVendorRoutes(page);

    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: JQUERY });
    await page.addScriptTag({ path: path.join(ANDI_DIR, 'andi.js') });

    const READY = () =>
      !!window.andiVersionNumber &&
      !!document.getElementById('ANDI508') &&
      !!window.testPageData &&
      typeof window.testPageData.numberOfAccessibilityAlertsFound === 'number';
    await page.waitForFunction(READY, { timeout: 30000 });

    // Count danger elements outside ANDI UI panel
    const dangerCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="ANDI508-element-danger"]'))
        .filter((el) => !el.closest('#ANDI508'))
        .length
    );

    // Exclude the fixture's intentional broken image (logo.png)
    const unexpected = externalAttempts.filter((u) => !u.includes('logo.png'));

    assert.equal(
      dangerCount,
      2,
      `Regression: expected 2 danger elements outside ANDI508 UI, got ${dangerCount}`
    );
    assert.equal(
      unexpected.length,
      0,
      `Regression: expected 0 unexpected external attempts, got ${unexpected.length}: ${JSON.stringify(unexpected)}`
    );

    await ctx.close();
  } finally {
    await browser.close();
  }
});
