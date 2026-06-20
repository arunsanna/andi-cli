'use strict';
/**
 * Phase 0 grounding spike #2 — determine the RELIABLE extraction source.
 *
 * VALIDATED 2026-06-20 against a SSAgov/ANDI clone (ANDI v29.2.2). Per module, in a fresh
 * page context, compared andiAlerter arrays vs DOM-counted flagged elements vs
 * testPageData.pageAlerts:
 *
 *   module | total | alerter D/W/C | DOM D/W/C | pageAlerts
 *     f    |   2   |   0/0/0       |  2/0/0    | array:0
 *     c    |   3   |   0/0/0       |  4/0/0    | array:0
 *     t    |   1   |   1/0/0       |  3/0/0    | array:0
 *     g    |   1   |   1/0/0       |  3/0/0    | array:0
 *
 * Conclusion: andiAlerter.{dangers,warnings,cautions} is a transient buffer ANDI empties
 * after analysis (0/0/0 for f and c even after a 1.2s settle); testPageData.pageAlerts is
 * empty. The DOM (.ANDI508-element-*) is the authoritative, consistent source. Extraction
 * must be DOM-primary. See docs/ARCHITECTURE.md Decision 4.
 *
 * Reproduce: see spikes/04-hermetic-vendor.cjs header (same ANDI_DIR / JQUERY env vars).
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const REPO = path.resolve(__dirname, '..');
const ANDI = process.env.ANDI_DIR || path.join(REPO, 'andi');
const JQ = process.env.JQUERY || path.join(REPO, 'src', 'vendor', 'jquery-3.7.1.min.js');
const MULTI = 'file://' + path.join(REPO, 'examples', 'multi-module-fixture.html');
const CT = { '.js':'application/javascript', '.css':'text/css', '.png':'image/png',
  '.gif':'image/gif', '.svg':'image/svg+xml', '.json':'application/json', '.cur':'image/x-icon', '.ico':'image/x-icon' };

function makeRouter(external) {
  return async (route) => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    const m = u.match(/\/accessibility\/andi\/([^?]+)/);
    if (m) {
      const f = path.join(ANDI, m[1]);
      if (f.startsWith(ANDI) && fs.existsSync(f))
        return route.fulfill({ status: 200, contentType: CT[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      external.push('MISSING ' + u); return route.fulfill({ status: 404, body: '' });
    }
    if (/\/jquery[.-]/i.test(u)) return route.fulfill({ status: 200, contentType: CT['.js'], body: fs.readFileSync(JQ) });
    external.push(u); return route.abort('blockedbyclient');
  };
}
const READY = () => !!window.andiVersionNumber && !!document.getElementById('ANDI508')
  && !!window.testPageData && typeof window.testPageData.numberOfAccessibilityAlertsFound === 'number';

async function launch(page, url, external) {
  await page.route('**/*', makeRouter(external));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: JQ });
  await page.addScriptTag({ path: path.join(ANDI, 'andi.js') });
  await page.waitForFunction(READY, { timeout: 30000 });
}
async function settleAndRead(page) {
  try {
    await page.waitForFunction(() => {
      const l = document.getElementById('ANDI508-alerts-list');
      const sig = (l ? l.innerHTML.length : 0) + ':' + (window.testPageData && window.testPageData.numberOfAccessibilityAlertsFound);
      window.__s = window.__s || { v: null, n: 0 };
      if (window.__s.v === sig) window.__s.n++; else { window.__s.v = sig; window.__s.n = 0; }
      return window.__s.n >= 3;
    }, { timeout: 12000, polling: 200 });
  } catch (e) {}
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const a = window.andiAlerter || {};
    const dom = (sev) => Array.from(document.querySelectorAll('[class*="ANDI508-element-' + sev + '"]')).filter((e) => !e.closest('#ANDI508')).length;
    const pa = window.testPageData.pageAlerts;
    return {
      total: window.testPageData.numberOfAccessibilityAlertsFound,
      alerter: { d: (a.dangers || []).length, w: (a.warnings || []).length, c: (a.cautions || []).length },
      dom: { d: dom('danger'), w: dom('warning'), c: dom('caution') },
      pageAlerts: Array.isArray(pa) ? 'array:' + pa.length : String(pa),
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log('module | total | alerter D/W/C | DOM D/W/C | pageAlerts');
  for (const mod of ['f', 'c', 't', 'g']) {
    const ext = [];
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await launch(page, MULTI, ext);
    if (mod !== 'f') await page.evaluate((m) => { window.__s = null; window.AndiModule.launchModule(m); }, mod);
    const r = await settleAndRead(page);
    console.log(`  ${mod}    |   ${r.total}   |   ${r.alerter.d}/${r.alerter.w}/${r.alerter.c}     |  ${r.dom.d}/${r.dom.w}/${r.dom.c}    | ${r.pageAlerts}`);
    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('SPIKE ERROR', e && e.stack || e); process.exit(1); });
