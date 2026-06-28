'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { installVendorRoutes } = require('../src/vendor-route.cjs');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = 'file://' + path.join(REPO, 'examples', 'fixture.html');
const ANDI_DIR = path.join(REPO, 'andi');
const JQUERY = path.join(REPO, 'src', 'vendor', 'jquery-3.7.1.min.js');

const READY = () =>
  !!window.andiVersionNumber &&
  !!document.getElementById('ANDI508') &&
  !!window.testPageData &&
  typeof window.testPageData.numberOfAccessibilityAlertsFound === 'number';

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/jquery-target.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end('window.__targetJqueryLoaded = "target";');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><script src="/jquery-target.js"></script><p>target</p>');
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('installVendorRoutes: no external requests and 2 danger elements on fixture', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();

    const { externalAttempts } = await installVendorRoutes(page);

    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: JQUERY });
    await page.addScriptTag({ path: path.join(ANDI_DIR, 'andi.js') });
    await page.waitForFunction(READY, { timeout: 30000 });

    // Exclude the fixture's intentional broken image (logo.png) from external check
    const unexpected = externalAttempts.filter((u) => !u.includes('logo.png'));
    assert.equal(
      unexpected.length,
      0,
      `Expected 0 external attempts (excl logo.png), got ${unexpected.length}: ${JSON.stringify(unexpected)}`
    );

    // Count .ANDI508-element-danger nodes that are NOT inside the ANDI508 UI panel
    const dangerCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="ANDI508-element-danger"]'))
        .filter((el) => !el.closest('#ANDI508'))
        .length
    );
    assert.equal(
      dangerCount,
      2,
      `Expected 2 danger elements outside ANDI508 UI, got ${dangerCount}`
    );

    await ctx.close();
  } finally {
    await browser.close();
  }
});

test('installVendorRoutes: does not replace target-page jQuery-like scripts', async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();
    await installVendorRoutes(page);

    await page.goto(`http://127.0.0.1:${server.address().port}/`, {
      waitUntil: 'domcontentloaded',
    });
    const loaded = await page.evaluate(() => window.__targetJqueryLoaded || null);

    assert.equal(loaded, 'target');
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
});
