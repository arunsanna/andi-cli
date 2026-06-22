'use strict';
/**
 * src/andi-helpers.cjs — shared low-level ANDI injection + wait helpers.
 *
 * Extracted here to avoid a circular dependency between scanner.cjs and
 * modules.cjs (both need these helpers; scanner requires modules, modules
 * must not require scanner).
 *
 * Exported:
 *   injectAndi(page)             — inject jQuery + andi.js via vendor routes
 *   waitAndiReady(page, timeout) — wait for ANDI full init (deterministic)
 *   waitModuleStable(page, timeout) — wait for module results to stabilize
 *   resolvePlaywright()          — load Playwright without forcing a layout
 *   ANDI_DIR, JQUERY             — paths to vendored assets
 */

const path = require('path');
const { ANDI_DIR, JQUERY } = require('./vendor-route.cjs');

/**
 * Inject jQuery then andi.js into a page that already has vendor routes
 * installed. Both scripts are served from the local filesystem so no
 * network calls are made.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
async function injectAndi(page) {
  await page.addScriptTag({ path: JQUERY });
  await page.addScriptTag({ path: path.join(ANDI_DIR, 'andi.js') });
}

/** Resolve playwright without forcing a specific install layout. */
function resolvePlaywright() {
  const tried = [];
  const candidates = ['playwright'];
  if (process.env.ANDI_PLAYWRIGHT_PATH) candidates.push(process.env.ANDI_PLAYWRIGHT_PATH);
  for (const c of candidates) {
    try { return require(c); } catch (e) { tried.push(`${c}: ${e.code || e.message}`); }
  }
  throw new Error(
    'Could not load Playwright. Run `npm install` in andi-cli, or set ' +
    'ANDI_PLAYWRIGHT_PATH to a playwright install.\nTried:\n  ' + tried.join('\n  ')
  );
}

/**
 * Resolves when ANDI has fully initialized:
 *   - window.andiVersionNumber is set
 *   - #ANDI508 element exists in the DOM
 *   - testPageData.numberOfAccessibilityAlertsFound is a number
 *
 * Uses page.waitForFunction — no fixed sleeps.
 *
 * @param {import('playwright').Page} page
 * @param {number} [timeout=30000]
 * @returns {Promise<void>}
 */
async function waitAndiReady(page, timeout = 30000) {
  await page.waitForFunction(
    () => !!window.andiVersionNumber &&
          !!document.getElementById('ANDI508') &&
          !!window.testPageData &&
          typeof window.testPageData.numberOfAccessibilityAlertsFound === 'number',
    { timeout }
  );
}

/**
 * Resolves when ANDI's results have stabilized — the combined signature
 * of (#ANDI508-alerts-list innerHTML length) + ':' + testPageData.numberOfAccessibilityAlertsFound
 * is unchanged across 3 consecutive polls at 250ms intervals.
 *
 * Pattern proven by spikes/04-hermetic-vendor.cjs (moduleStable function).
 * Uses page.waitForFunction — no fixed sleeps.
 *
 * @param {import('playwright').Page} page
 * @param {number} [timeout=12000]
 * @returns {Promise<void>}
 */
async function waitModuleStable(page, timeout = 12000) {
  await page.waitForFunction(
    () => {
      const l = document.getElementById('ANDI508-alerts-list');
      const sig = (l ? l.innerHTML.length : 0) + ':' +
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
    { timeout, polling: 250 }
  );
}

module.exports = { injectAndi, waitAndiReady, waitModuleStable, resolvePlaywright, ANDI_DIR, JQUERY };
