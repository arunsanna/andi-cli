'use strict';
/**
 * andi-cli scanner — run the SSA ANDI accessibility tool headlessly and return
 * structured Section 508 findings.
 *
 * Strategy (validated by spikes/01-feasibility.cjs + spikes/02-internals-probe.cjs
 * + spikes/04-hermetic-vendor.cjs):
 *   1. Load the target URL in headless Chromium with bypassCSP:true.
 *   2. Install vendor routes (local andi/ + jquery) so no network calls reach ssa.gov.
 *   3. Inject jQuery then local andi/andi.js via addScriptTag.
 *   4. Wait for deterministic ready signal (waitAndiReady) + stable results (waitModuleStable).
 *   5. Read the page-level summary + flagged elements.
 */

const path = require('path');
const { installVendorRoutes, ANDI_DIR, JQUERY } = require('./vendor-route.cjs');

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

/**
 * In-page extraction. Runs inside the target page after ANDI has initialized.
 * Reads ANDI's aggregated alerts list (#ANDI508-alerts-list), grouped by type and
 * severity (ANDI508-display-danger/-warning/-caution), plus the page summary
 * (#ANDI508-pageAnalysis) and the actual flagged DOM elements (ANDI508-element-*).
 * Returns a plain serializable object.
 */
/* istanbul ignore next — executes in browser context */
function extractFindings() {
  const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
  const sevOf = (cls) => /danger/i.test(cls) ? 'danger'
    : /warning/i.test(cls) ? 'warning'
    : /caution/i.test(cls) ? 'caution' : 'info';

  const pageSummary = txt(document.getElementById('ANDI508-pageAnalysis'))
    || txt(document.getElementById('ANDI508-additionalPageResults'));
  const tpd = window.testPageData || {};
  const totalAlerts = typeof tpd.numberOfAccessibilityAlertsFound === 'number'
    ? tpd.numberOfAccessibilityAlertsFound : null;
  const m = pageSummary.match(/Focusable Elements Found:\s*(\d+)/i);
  const focusableCount = m ? parseInt(m[1], 10) : null;

  // Aggregated alerts: ANDI groups them under #ANDI508-alerts-list.
  const list = document.getElementById('ANDI508-alerts-list');
  const alertGroups = [];
  const alerts = [];
  if (list) {
    list.querySelectorAll('.ANDI508-alertGroup-container').forEach((g) => {
      const severity = sevOf(g.className);
      const label = txt(g.querySelector('.ANDI508-alertGroup-toggler')) || txt(g).split(/\s{2,}/)[0];
      const items = Array.from(g.querySelectorAll('.ANDI508-alertGroup-list > li'))
        .map((li) => txt(li)).filter(Boolean);
      alertGroups.push({ severity, label, count: items.length, items });
      items.forEach((message) => alerts.push({ severity, group: label, message }));
    });
    // Ungrouped individual alerts (single occurrences not wrapped in a group).
    list.querySelectorAll('li[class*="ANDI508-display-"]').forEach((li) => {
      if (li.closest('.ANDI508-alertGroup-container') || li.classList.contains('ANDI508-alertGroup-container')) return;
      const message = txt(li);
      if (message) alerts.push({ severity: sevOf(li.className), group: null, message });
    });
  }

  // The actual page DOM nodes ANDI flagged (excludes ANDI's own UI).
  const flaggedElements = Array.from(document.querySelectorAll(
    '[class*="ANDI508-element-danger"],[class*="ANDI508-element-warning"],[class*="ANDI508-element-caution"]'
  )).filter((e) => !e.closest('#ANDI508')).slice(0, 100).map((e) => ({
    severity: sevOf(e.className),
    tag: e.tagName.toLowerCase(),
    html: e.outerHTML.replace(/\s+/g, ' ').slice(0, 200),
  }));

  return {
    andiVersion: window.andiVersionNumber || null,
    focusableCount,
    totalAlerts,
    pageSummary,
    alertGroups,
    alerts,
    flaggedElements,
    aggregate: {
      dangers: (window.andiAlerter && Array.isArray(window.andiAlerter.dangers)) ? window.andiAlerter.dangers.length : null,
      warnings: (window.andiAlerter && Array.isArray(window.andiAlerter.warnings)) ? window.andiAlerter.warnings.length : null,
      cautions: (window.andiAlerter && Array.isArray(window.andiAlerter.cautions)) ? window.andiAlerter.cautions.length : null,
    },
  };
}

/** ANDI analysis modules selectable from its module menu. */
const ANDI_MODULES = { f: 'focusable', g: 'graphics/images', l: 'links/buttons', t: 'tables', s: 'structures', c: 'color contrast', h: 'hidden', i: 'iframes' };

/**
 * Scan a single URL with ANDI.
 * Context is created with bypassCSP:true and vendor routes intercept all
 * ssa.gov ANDI requests to local files — no live network dependency.
 *
 * @param {string} url
 * @param {{timeoutMs?:number, headless?:boolean, screenshot?:string, module?:string}} [opts]
 * @returns {Promise<object>} structured findings including externalAttempts
 */
async function scan(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || 30000;
  const { chromium } = resolvePlaywright();

  const browser = await chromium.launch({ headless: opts.headless !== false });
  const startedAt = new Date().toISOString();
  try {
    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();

    const { externalAttempts } = await installVendorRoutes(page);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.addScriptTag({ path: JQUERY });
    await page.addScriptTag({ path: path.join(ANDI_DIR, 'andi.js') });

    await waitAndiReady(page, timeoutMs);

    // Optionally switch ANDI module (default is focusable elements).
    const mod = opts.module || 'f';
    if (mod !== 'f' && ANDI_MODULES[mod]) {
      await page.evaluate((mm) => {
        // Reset stability tracker before switching modules
        window.__andiStable = null;
        const b = document.getElementById('ANDI508-moduleMenu-button-' + mm);
        if (b) b.click();
      }, mod);
    }

    await waitModuleStable(page, 12000);

    const findings = await page.evaluate(extractFindings);
    if (opts.screenshot) await page.screenshot({ path: opts.screenshot, fullPage: true });

    return {
      url,
      scannedAt: startedAt,
      module: ANDI_MODULES[mod] || mod,
      ...findings,
      externalAttempts,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scan, waitAndiReady, waitModuleStable, ANDI_MODULES };
