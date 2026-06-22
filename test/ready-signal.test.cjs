'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');
const { installVendorRoutes, ANDI_DIR, JQUERY } = require('../src/vendor-route.cjs');
const { scan, waitAndiReady, waitModuleStable } = require('../src/scanner.cjs');

const REPO = path.resolve(__dirname, '..');
const FIXTURE_FILE = path.join(REPO, 'examples', 'fixture.html');
const FIXTURE_URL = 'file://' + FIXTURE_FILE;

test('waitAndiReady and waitModuleStable are exported from scanner.cjs', () => {
  assert.equal(typeof waitAndiReady, 'function', 'waitAndiReady should be exported');
  assert.equal(typeof waitModuleStable, 'function', 'waitModuleStable should be exported');
});

test('scan fixture hermetically: 0 external requests (excl logo.png), 2 danger findings, no fixed sleeps', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();

    const { externalAttempts } = await installVendorRoutes(page);

    await page.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: JQUERY });
    await page.addScriptTag({ path: path.join(ANDI_DIR, 'andi.js') });

    // waitAndiReady must resolve without using waitForTimeout
    await waitAndiReady(page, 30000);

    // waitModuleStable must resolve without using waitForTimeout
    await waitModuleStable(page, 12000);

    // Verify hermeticity: no external requests except fixture's broken logo.png
    const unexpected = externalAttempts.filter((u) => !u.includes('logo.png'));
    assert.equal(
      unexpected.length,
      0,
      `Expected 0 external attempts (excl logo.png), got ${unexpected.length}: ${JSON.stringify(unexpected)}`
    );

    // Verify 2 danger findings on the page (outside ANDI's own UI)
    const dangerCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="ANDI508-element-danger"]'))
        .filter((el) => !el.closest('#ANDI508'))
        .length
    );
    assert.equal(dangerCount, 2, `Expected 2 danger elements outside ANDI508 UI, got ${dangerCount}`);

    await ctx.close();
  } finally {
    await browser.close();
  }
});

test('scan() uses bypassCSP context and no fixed sleeps: fixture yields 2 danger findings hermetically', async () => {
  const result = await scan(FIXTURE_URL, { headless: true });

  // Scan must complete without throwing
  assert.ok(result, 'scan() should return a result');

  // New shape: findings[] + counts + worst (aggregate output)
  assert.ok(Array.isArray(result.findings), 'scan() result must have findings array');

  // Must report >= 2 danger findings (button + link with no accessible name)
  const dangerFindings = result.findings.filter((f) => f.severity === 'danger');
  assert.ok(
    dangerFindings.length >= 2,
    `Expected >=2 danger findings, got ${dangerFindings.length}: ${JSON.stringify(dangerFindings)}`
  );

  // worst must be 'danger'
  assert.equal(result.worst, 'danger', 'worst must be "danger" for the fixture');

  // externalAttempts (excluding fixture's broken logo.png) must be empty
  const unexpected = (result.externalAttempts || []).filter((u) => !u.includes('logo.png'));
  assert.equal(
    unexpected.length,
    0,
    `Expected 0 external attempts (excl logo.png), got ${unexpected.length}: ${JSON.stringify(unexpected)}`
  );
});
