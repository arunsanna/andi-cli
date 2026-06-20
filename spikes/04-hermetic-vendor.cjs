'use strict';
/**
 * Phase 0 grounding spike — hermetic vendored ANDI + programmatic module launch.
 *
 * VALIDATED 2026-06-20 against a SSAgov/ANDI clone (ANDI v29.2.2):
 *   G1 hermetic: 0 external requests, parity (2 alerts) on examples/fixture.html
 *   G2 extraction: window.andiAlerter arrays are a TRANSIENT buffer (unreliable);
 *      testPageData.pageAlerts is empty — the DOM is the authoritative source
 *   G4 AndiModule.launchModule(letter) drives modules f/c/t/g/l hermetically
 *
 * Reproduce pre-fork:
 *   git clone --depth 1 https://github.com/SSAgov/ANDI /tmp/andi-src
 *   ANDI_DIR=/tmp/andi-src/andi JQUERY=/tmp/jquery-3.7.1.min.js node spikes/04-hermetic-vendor.cjs
 * Post-fork: defaults resolve to ./andi and ./src/vendor/jquery-3.7.1.min.js.
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const REPO = path.resolve(__dirname, '..');
const ANDI = process.env.ANDI_DIR || path.join(REPO, 'andi');
const JQ = process.env.JQUERY || path.join(REPO, 'src', 'vendor', 'jquery-3.7.1.min.js');
const FIXTURE = 'file://' + path.join(REPO, 'examples', 'fixture.html');
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
async function moduleStable(page) {
  await page.waitForFunction(() => {
    const l = document.getElementById('ANDI508-alerts-list');
    const sig = (l ? l.innerHTML.length : 0) + ':' + (window.testPageData && window.testPageData.numberOfAccessibilityAlertsFound);
    window.__s = window.__s || { v: null, n: 0 };
    if (window.__s.v === sig) window.__s.n++; else { window.__s.v = sig; window.__s.n = 0; }
    return window.__s.n >= 3;
  }, { timeout: 12000, polling: 200 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // G1 + G2 + G4
  const ext = [];
  let page = await (await browser.newContext()).newPage();
  await launch(page, FIXTURE, ext);
  const g = await page.evaluate(() => ({
    total: window.testPageData.numberOfAccessibilityAlertsFound,
    hasLaunch: !!(window.AndiModule && typeof window.AndiModule.launchModule === 'function'),
  }));
  const offenders = ext.filter((u) => !u.includes('logo.png'));
  console.log('G1 hermetic+parity: alerts=%d (expect 2) | blocked external=%d %j', g.total, offenders.length, offenders.slice(0, 5));
  console.log('G4 AndiModule.launchModule is function:', g.hasLaunch);
  await page.close();
  if (g.total !== 2 || offenders.length) { console.error('FAIL'); process.exit(1); }

  // G3 multi-module via launchModule, hermetic
  const ext2 = [];
  page = await (await browser.newContext()).newPage();
  await launch(page, MULTI, ext2);
  console.log('G3 multi-module (DOM-counted flagged elements):');
  for (const mod of ['f', 'c', 't', 'g', 'l']) {
    await page.evaluate((m) => { window.__s = null; window.AndiModule.launchModule(m); }, mod);
    try { await moduleStable(page); } catch (e) {}
    const dom = await page.evaluate(() => {
      const c = (s) => Array.from(document.querySelectorAll('[class*="ANDI508-element-' + s + '"]')).filter((e) => !e.closest('#ANDI508')).length;
      return { d: c('danger'), w: c('warning'), c: c('caution'), total: window.testPageData.numberOfAccessibilityAlertsFound };
    });
    console.log(`  module=${mod} total=${dom.total} DOM D/W/C=${dom.d}/${dom.w}/${dom.c}`);
  }
  const off2 = ext2.filter((u) => !u.includes('missing.png') && !u.includes('/account'));
  console.log('multi-module blocked external (excl planted 404s):', off2.length);
  await page.close();

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('SPIKE ERROR', e && e.stack || e); process.exit(1); });
