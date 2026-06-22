'use strict';
/**
 * test/selectors.contract.test.cjs — Validation V15, Decision 9
 *
 * Guard every upstream sync.  Load andi/andi.js headless (exact same inject
 * path as the real scan: bypassCSP context + installVendorRoutes + injectAndi)
 * and assert the load-bearing surface is intact.
 *
 * Run: npm test (CI — .github/workflows/selftest.yml)
 * Also run manually after: git merge upstream
 *
 * A RED test here means SSA changed a load-bearing selector.
 * Fix: update extract.cjs / docs / ARCHITECTURE.md before releasing.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');
const { installVendorRoutes } = require('../src/vendor-route.cjs');
const { injectAndi, waitAndiReady, waitModuleStable } = require('../src/andi-helpers.cjs');

const REPO = path.resolve(__dirname, '..');
const MULTI_FIXTURE = 'file://' + path.join(REPO, 'examples', 'multi-module-fixture.html');

// ---------------------------------------------------------------------------
// Shared browser setup helpers — each test gets its own fresh context so
// tests are isolated and can run in any order.
// ---------------------------------------------------------------------------

async function newContext(browser) {
  return browser.newContext({ bypassCSP: true });
}

async function loadAndInject(browser, url, key) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await installVendorRoutes(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await injectAndi(page);
  await waitAndiReady(page, 30000);
  if (key) {
    await page.evaluate((m) => {
      window.__andiStable = null;
      window.AndiModule.launchModule(m);
    }, key);
    await waitModuleStable(page, 12000);
  }
  return { ctx, page };
}

// ---------------------------------------------------------------------------
// Single shared browser for all tests in this file.
// ---------------------------------------------------------------------------
let browser;
async function getBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true });
  return browser;
}

// node:test doesn't have afterAll; clean up via process exit hook.
process.on('exit', () => { if (browser) browser.close().catch(() => {}); });

// ---------------------------------------------------------------------------
// V15-A: #ANDI508 root element exists after injection
// ---------------------------------------------------------------------------
test('V15: #ANDI508 root element is present after injection (ready-signal fires)', async () => {
  const b = await getBrowser();
  const { ctx, page } = await loadAndInject(b, MULTI_FIXTURE, null);
  try {
    const exists = await page.evaluate(
      () => !!document.getElementById('ANDI508')
    );
    assert.ok(exists, '#ANDI508 must exist after andi.js injection — ready signal depends on it');
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// V15-B: #ANDI508-alerts-list exists after a module runs
// ---------------------------------------------------------------------------
test('V15: #ANDI508-alerts-list exists after launchModule("f")', async () => {
  const b = await getBrowser();
  const { ctx, page } = await loadAndInject(b, MULTI_FIXTURE, 'f');
  try {
    const exists = await page.evaluate(
      () => !!document.getElementById('ANDI508-alerts-list')
    );
    assert.ok(
      exists,
      '#ANDI508-alerts-list must exist after a module runs — extraction depends on it'
    );
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// V15-C: ready-signal shape holds
//   window.andiVersionNumber set AND window.testPageData with a numeric
//   numberOfAccessibilityAlertsFound
// ---------------------------------------------------------------------------
test('V15: ready-signal shape: andiVersionNumber string AND testPageData.numberOfAccessibilityAlertsFound numeric', async () => {
  const b = await getBrowser();
  const { ctx, page } = await loadAndInject(b, MULTI_FIXTURE, null);
  try {
    const sig = await page.evaluate(() => ({
      andiVersionNumber: window.andiVersionNumber,
      typeOfVersion: typeof window.andiVersionNumber,
      hasTestPageData: !!window.testPageData,
      typeOfAlerts: typeof (window.testPageData && window.testPageData.numberOfAccessibilityAlertsFound),
    }));

    assert.ok(sig.andiVersionNumber, 'window.andiVersionNumber must be set after injection');
    assert.equal(sig.typeOfVersion, 'string',
      `window.andiVersionNumber must be a string, got ${sig.typeOfVersion}`);
    assert.ok(sig.hasTestPageData, 'window.testPageData must exist after injection');
    assert.equal(sig.typeOfAlerts, 'number',
      `testPageData.numberOfAccessibilityAlertsFound must be a number, got ${sig.typeOfAlerts}`);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// V15-D: at least one .ANDI508-element-{danger,warning,caution} node produced
//         on the multi-module fixture (per-element mechanism works for f/c/t/g/l)
// ---------------------------------------------------------------------------
test('V15: at least one .ANDI508-element-{danger,warning,caution} node produced on multi fixture', async () => {
  const b = await getBrowser();
  const { ctx, page } = await loadAndInject(b, MULTI_FIXTURE, 'f');
  try {
    const count = await page.evaluate(() => {
      const matches = Array.from(
        document.querySelectorAll('[class*="ANDI508-element-danger"],[class*="ANDI508-element-warning"],[class*="ANDI508-element-caution"]')
      ).filter((el) => !el.closest('#ANDI508'));
      return matches.length;
    });
    assert.ok(
      count > 0,
      `Expected at least 1 .ANDI508-element-{danger,warning,caution} node (outside #ANDI508 UI), got ${count}`
    );
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// V15-E: typeof window.AndiModule.launchModule === 'function'
// ---------------------------------------------------------------------------
test('V15: typeof window.AndiModule.launchModule === "function"', async () => {
  const b = await getBrowser();
  const { ctx, page } = await loadAndInject(b, MULTI_FIXTURE, null);
  try {
    const result = await page.evaluate(() => ({
      hasAndiModule: typeof window.AndiModule,
      hasLaunchModule: typeof (window.AndiModule && window.AndiModule.launchModule),
    }));
    // AndiModule is a constructor function in ANDI v29 — 'function' is the correct type.
    assert.ok(
      result.hasAndiModule === 'function' || result.hasAndiModule === 'object',
      `window.AndiModule must be a function or object, got ${result.hasAndiModule}`
    );
    assert.equal(
      result.hasLaunchModule,
      'function',
      `window.AndiModule.launchModule must be a function, got ${result.hasLaunchModule}`
    );
  } finally {
    await ctx.close();
  }
});
