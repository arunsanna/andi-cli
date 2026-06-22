'use strict';
/**
 * src/modules.cjs — per-module ANDI scanning via AndiModule.launchModule.
 *
 * Design (Decision 5, grounded by spikes/04-hermetic-vendor.cjs):
 *   Each scanModule() call gets its OWN fresh BrowserContext (bypassCSP:true).
 *   This sidesteps the #ANDI508-alerts-container duplication issue documented
 *   in extract.cjs and gives deterministic, isolated results per module.
 *
 * Call order contract:
 *   installVendorRoutes → goto → injectAndi → waitAndiReady
 *   → AndiModule.launchModule(key) → waitModuleStable → extractFindings
 *
 * Exported:
 *   MODULES  — {letter: canonicalName} registry
 *   scanModule(browser, url, key, opts?) → Promise<Finding[]>
 */

const { installVendorRoutes } = require('./vendor-route.cjs');
const { injectAndi, waitAndiReady, waitModuleStable } = require('./andi-helpers.cjs');
const { extractFindings } = require('./extract.cjs');

/**
 * Module letter → canonical name.
 * Mirrors the MODULE_NAMES table in extract.cjs — single source of truth is
 * extract.cjs; this registry is the public-facing API surface.
 */
const MODULES = {
  f: 'focusable',
  g: 'graphics',
  l: 'links',
  t: 'tables',
  s: 'structures',
  c: 'contrast',
  h: 'hidden',
  i: 'iframes',
};

/**
 * Scan a URL with a single ANDI module using a fresh browser context.
 *
 * One fresh context per call (Decision 5) — avoids the stale-container
 * append bug and guarantees determinism across repeated runs.
 *
 * Returns { findings, externalAttempts } so callers can collect network
 * attempts across multi-module runs (used by --strict-offline).
 *
 * @param {import('playwright').Browser} browser  Already-launched browser.
 * @param {string} url                            Target URL (file:// or http).
 * @param {string} key                            Module letter (f/g/l/t/s/c/h/i).
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{ findings: Array<import('./types').Finding>, externalAttempts: string[] }>}
 */
async function scanModule(browser, url, key, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;

  // Fresh isolated context — CSP bypass for script injection.
  const ctx = await browser.newContext({ bypassCSP: true });
  try {
    const page = await ctx.newPage();

    // 1. Vendor routes: serve andi/ + jquery locally, block everything else.
    const { externalAttempts } = await installVendorRoutes(page);

    // 2. Load the target URL.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // 3. Inject jQuery + andi.js (shared helper — single inject path).
    await injectAndi(page);

    // 4. Wait for ANDI to fully initialize (ready signal).
    await waitAndiReady(page, timeoutMs);

    // 5. Programmatically launch the requested module.
    //    NEVER menu-click — proven in spikes/04.
    //    Reset stability tracker before switching so waitModuleStable
    //    measures the new module's stable state, not the initial one.
    await page.evaluate((m) => {
      window.__andiStable = null;
      window.AndiModule.launchModule(m);
    }, key);

    // 6. Wait for the module's alerts to stabilize.
    //    Honor opts.timeoutMs for the stability wait too (carry-forward: do not
    //    hard-code while timeoutMs is honored elsewhere).
    const stableTimeout = Math.min(timeoutMs, 12000);
    await waitModuleStable(page, stableTimeout);

    // 7. Extract findings (alerts-list-primary strategy from extract.cjs).
    const findings = await extractFindings(page, key);

    // 8. Read the ANDI version from window — set by andi.js on init, stable
    //    after waitAndiReady. Returned so scan() can surface it on the result.
    const andiVersion = await page.evaluate(() => window.andiVersionNumber || null);

    return { findings, externalAttempts, andiVersion };
  } finally {
    // Always close context to release resources; browser stays open.
    await ctx.close();
  }
}

module.exports = { MODULES, scanModule };
