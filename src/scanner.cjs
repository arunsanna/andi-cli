'use strict';
/**
 * andi-cli scanner — run the SSA ANDI accessibility tool headlessly and return
 * structured Section 508 findings.
 *
 * Strategy (validated by spikes/01-feasibility.cjs + spikes/02-internals-probe.cjs):
 *   1. Load the target URL in headless Chromium.
 *   2. Inject the official andi.js source — ANDI auto-launches and builds its UI.
 *   3. Read the page-level summary (#ANDI508-additionalPageResults) + window.testPageData.
 *   4. Step ANDI's focusable-element list, harvesting per-element alerts with severity.
 *
 * ANDI is element-by-element by design, so we drive its element iteration rather
 * than expecting a single page report (unlike axe-core's one-shot axe.run()).
 */

const DEFAULT_ANDI_SRC = 'https://www.ssa.gov/accessibility/andi/andi.js';

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
 * @param {string} url
 * @param {{andiSrc?:string, timeoutMs?:number, headless?:boolean, screenshot?:string}} [opts]
 * @returns {Promise<object>} structured findings
 */
async function scan(url, opts = {}) {
  const andiSrc = opts.andiSrc || DEFAULT_ANDI_SRC;
  const timeoutMs = opts.timeoutMs || 30000;
  const { chromium } = resolvePlaywright();

  const browser = await chromium.launch({ headless: opts.headless !== false });
  const startedAt = new Date().toISOString();
  const failedRequests = [];
  try {
    const page = await (await browser.newContext()).newPage();
    page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.addScriptTag({ url: andiSrc });
    await page.waitForFunction(
      () => !!window.andiVersionNumber && !!document.getElementById('ANDI508'),
      { timeout: timeoutMs }
    );
    await page.waitForTimeout(1200);

    // Optionally switch ANDI module (default is focusable elements).
    const mod = opts.module || 'f';
    if (mod !== 'f' && ANDI_MODULES[mod]) {
      await page.evaluate((mm) => {
        const b = document.getElementById('ANDI508-moduleMenu-button-' + mm);
        if (b) b.click();
      }, mod);
      await page.waitForTimeout(1500);
    }

    const findings = await page.evaluate(extractFindings);
    if (opts.screenshot) await page.screenshot({ path: opts.screenshot, fullPage: true });

    return {
      url,
      scannedAt: startedAt,
      andiSource: andiSrc,
      module: ANDI_MODULES[mod] || mod,
      ...findings,
      failedRequests: failedRequests.slice(0, 25),
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scan, DEFAULT_ANDI_SRC, ANDI_MODULES };
