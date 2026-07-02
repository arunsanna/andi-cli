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
 *   installVendorRoutes → navigateTargetPage → waitTargetPageReady → injectAndi → waitAndiReady
 *   → waitActiveModule/launch requested module → waitModuleStable → extractFindings
 *
 * Exported:
 *   MODULES  — {letter: canonicalName} registry
 *   scanModule(browser, url, key, opts?) → Promise<Finding[]>
 */

const { installVendorRoutes } = require('./vendor-route.cjs');
const {
  injectAndi,
  navigateTargetPage,
  waitTargetPageReady,
  waitAndiReady,
  waitActiveModule,
  waitModuleStable,
} = require('./andi-helpers.cjs');
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
 * @param {{timeoutMs?: number, strictOffline?: boolean, allowedOrigins?: string[]}} [opts]
 * @returns {Promise<{ findings: Array<import('./types').Finding>, externalAttempts: string[] }>}
 */
async function scanModule(browser, url, key, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;

  // Fresh isolated context — CSP bypass for script injection.
  const ctx = await browser.newContext({ bypassCSP: true });
  try {
    const page = await ctx.newPage();

    // 1. Vendor routes: serve andi/ + jquery locally; let target page load normally
    //    unless strictOffline is set (hermetic / fully-offline mode).
    const { externalAttempts } = await installVendorRoutes(page, {
      strictOffline: opts.strictOffline,
      allowedOrigins: opts.allowedOrigins,
    });

    // 2. Load the target URL.
    await navigateTargetPage(page, url, timeoutMs);

    // 3. Wait for normal browser/bookmarklet launch state before analysis.
    await waitTargetPageReady(page, timeoutMs);

    // 4. Inject jQuery + andi.js (shared helper — single inject path).
    await injectAndi(page);

    // 5. Wait for ANDI to fully initialize (ready signal).
    await waitAndiReady(page, timeoutMs);

    // 6. Programmatically launch the requested module.
    //    NEVER menu-click — proven in spikes/04.
    //    ANDI opens in fANDI by default, so do not relaunch focusable.
    //    For every non-default module, verify the ANDI shell has actually
    //    switched before waiting on/extracting the alert list.
    await waitActiveModule(page, 'f', timeoutMs);
    if (key !== 'f') {
      await page.evaluate((m) => {
        window.__andiStable = null;
        window.AndiModule.launchModule(m);
      }, key);
      await waitActiveModule(page, key, timeoutMs);
    }

    // 7. Wait for the module's alerts to stabilize.
    //    Honor opts.timeoutMs for the stability wait too (carry-forward: do not
    //    hard-code while timeoutMs is honored elsewhere).
    const stableTimeout = Math.min(timeoutMs, 12000);
    await page.evaluate(() => { window.__andiStable = null; });
    await waitModuleStable(page, stableTimeout);

    // 8. Extract findings (alerts-list-primary strategy from extract.cjs).
    const findings = await extractFindings(page, key);

    // 9. Read the ANDI version from window — set by andi.js on init, stable
    //    after waitAndiReady. Returned so scan() can surface it on the result.
    const andiVersion = await page.evaluate(() => window.andiVersionNumber || null);

    return { findings, externalAttempts, andiVersion };
  } finally {
    // Always close context to release resources; browser stays open.
    await ctx.close();
  }
}

module.exports = { MODULES, scanModule };
