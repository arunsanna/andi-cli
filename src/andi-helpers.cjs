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
 *   navigateTargetPage(page, url, timeout) — attach to target page navigation
 *   waitTargetPageReady(page, timeout) — wait for target page load before injection
 *   waitAndiReady(page, timeout) — wait for ANDI full init (deterministic)
 *   waitActiveModule(page, key, timeout) — wait until requested ANDI module is active
 *   waitModuleStable(page, timeout) — wait for module results to stabilize
 *   resolvePlaywright()          — load Playwright without forcing a layout
 *   ANDI_DIR, JQUERY             — paths to vendored assets
 */

const path = require('path');
const { ANDI_DIR, JQUERY } = require('./vendor-route.cjs');

/**
 * Return true when a page's jQuery version is missing or older than ANDI's
 * minimum supported version.
 *
 * Mirrors the version comparison in andi/andi.js. Keep this behavior aligned
 * with the bookmarklet so the CLI does not replace a page's own sufficient
 * jQuery and alter page event state before lANDI/cANDI scan it.
 *
 * @param {string|null|undefined} version
 * @param {string} [minimumVersion='1.9.1']
 * @returns {boolean}
 */
function needsJquery(version, minimumVersion = '1.9.1') {
  if (!version) return true;
  const j = String(version).split('.');
  const m = String(minimumVersion).split('.');
  for (let i = 0; i < 3; i++) {
    const current = parseInt(j[i] || '0', 10);
    const minimum = parseInt(m[i] || '0', 10);
    if (current > minimum) return false;
    if (current < minimum) return true;
  }
  return false;
}

/**
 * Inject ANDI into a page that already has vendor routes installed.
 *
 * The SSA bookmarklet reuses an existing sufficient page jQuery and only
 * downloads jQuery when needed. The CLI follows that behavior and injects the
 * pinned local copy only when the target page has no supported jQuery.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
async function injectAndi(page) {
  const jqueryVersion = await page.evaluate(() => window.jQuery?.fn?.jquery || null);
  if (needsJquery(jqueryVersion)) {
    await page.addScriptTag({ path: JQUERY });
  }
  await page.addScriptTag({ path: path.join(ANDI_DIR, 'andi.js') });
}

/**
 * Navigate to a target page without treating delayed DOMContentLoaded as a
 * scanner failure.
 *
 * Some public pages complete response commit quickly but delay
 * DOMContentLoaded long enough to blow up module-level scans. A human can
 * still launch ANDI once the page is usable, so the scanner commits to the
 * navigation, then lets waitTargetPageReady decide how settled the DOM is.
 *
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {number} [timeout=30000]
 * @returns {Promise<void>}
 */
async function navigateTargetPage(page, url, timeout = 30000) {
  await page.goto(url, { waitUntil: 'commit', timeout });
  await page.waitForLoadState('domcontentloaded', { timeout: Math.min(timeout, 15000) }).catch(() => {});
}

/**
 * Wait for the target page to reach the normal user/bookmarklet launch point.
 *
 * A real ANDI browser pass is normally started after the page is visually
 * loaded. Injecting at DOMContentLoaded can analyze transient dynamic states
 * before CSS/background images and client-rendered widgets have settled.
 *
 * @param {import('playwright').Page} page
 * @param {number} [timeout=30000]
 * @returns {Promise<void>}
 */
async function waitTargetPageReady(page, timeout = 30000) {
  const loadTimeout = Math.min(timeout, 15000);
  await page.waitForLoadState('load', { timeout: loadTimeout }).catch(() => {});
  const stableTimeout = Math.min(timeout, 8000);
  await page.waitForFunction(
    () => {
      const body = document.body;
      const disabledCount = document.querySelectorAll(
        ':disabled,[disabled],a[aria-disabled="true"],button[aria-disabled="true"]'
      ).length;
      const sig = [
        document.readyState,
        body ? body.innerHTML.length : 0,
        document.querySelectorAll('*').length,
        disabledCount,
      ].join(':');
      window.__andiTargetPageStable = window.__andiTargetPageStable || { v: null, n: 0 };
      if (window.__andiTargetPageStable.v === sig) {
        window.__andiTargetPageStable.n++;
      } else {
        window.__andiTargetPageStable.v = sig;
        window.__andiTargetPageStable.n = 0;
      }
      return window.__andiTargetPageStable.n >= 3;
    },
    { timeout: stableTimeout, polling: 250 }
  ).catch(() => {});
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
 * Resolves when ANDI's shell reports the requested active module.
 *
 * This prevents extracting stale focusable-module alerts after a module launch
 * on dynamic pages where the alert list can become stable before the requested
 * module has fully taken over the ANDI UI.
 *
 * @param {import('playwright').Page} page
 * @param {string} moduleKey
 * @param {number} [timeout=30000]
 * @returns {Promise<void>}
 */
async function waitActiveModule(page, moduleKey, timeout = 30000) {
  await page.waitForFunction(
    (key) => {
      const root = document.getElementById('ANDI508');
      const label = document.getElementById('ANDI508-module-name');
      const moduleVersion = (label?.getAttribute('data-andi508-moduleversion') || '').toLowerCase();
      const labelText = (label?.textContent || '').trim().toLowerCase();
      return !!root &&
        root.classList.contains(`ANDI508-module-${key}`) &&
        (labelText === key || moduleVersion.includes(`${key}andi`));
    },
    moduleKey,
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

module.exports = {
  injectAndi,
  needsJquery,
  navigateTargetPage,
  waitTargetPageReady,
  waitAndiReady,
  waitActiveModule,
  waitModuleStable,
  resolvePlaywright,
  ANDI_DIR,
  JQUERY,
};
