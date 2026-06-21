'use strict';
/**
 * Phase 1 ENTRY-GROUNDING spike — VALIDATED 2026-06-21 against a SSAgov/ANDI v29.2.2 clone.
 * Proves the two Phase-1 entry assumptions; one held, one was corrected:
 *
 *   A) CSP bypass (Decision 3) — PROVEN. With a restrictive CSP *response header*
 *      (script-src 'self'), a default context REFUSES the inline ANDI injection
 *      ("Refused to execute inline script"); a bypassCSP:true context injects, runs,
 *      and finds the planted danger with ZERO external requests.
 *
 *   B) modules s/h/i — launch + produce findings, but ONLY in the alerts list
 *      (#ANDI508-alerts-list / numberOfAccessibilityAlertsFound). They emit ZERO
 *      .ANDI508-element-* per-element highlights (those exist only for f/c/t/g/l).
 *      Live captures: s -> "[role=heading] used without [aria-level]"; h -> "CSS Content
 *      Alerts: Content injected via ::before/::after"; i -> "Iframe has no accessible
 *      name or [title]". => extraction is alerts-list-primary (ARCHITECTURE Decision 4,
 *      amended). The per-module alerts-list count is the assertion basis; per-element
 *      highlights are enrichment.
 *
 * Reproduce pre-fork:
 *   git clone --depth 1 https://github.com/SSAgov/ANDI /tmp/andi-src
 *   ANDI_DIR=/tmp/andi-src/andi node spikes/06-phase1-grounding.cjs
 * Post-fork: defaults resolve to ./andi and ./src/vendor/jquery-3.7.1.min.js.
 */
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const REPO = path.resolve(__dirname, '..');
const ANDI = process.env.ANDI_DIR || path.join(REPO, 'andi');
const JQ = process.env.JQUERY || path.join(REPO, 'src', 'vendor', 'jquery-3.7.1.min.js');
const CT = { '.js':'application/javascript', '.css':'text/css', '.png':'image/png',
  '.gif':'image/gif', '.svg':'image/svg+xml', '.json':'application/json', '.cur':'image/x-icon', '.ico':'image/x-icon' };

function makeRouter(external, base) {
  return async (route) => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (base && u.startsWith(base)) return route.continue();           // the CSP test server itself
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
async function inject(page, url, external, base) {
  await page.route('**/*', makeRouter(external, base));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: JQ });
  await page.addScriptTag({ path: path.join(ANDI, 'andi.js') });
}
async function stable(page) {
  try { await page.waitForFunction(() => {
    const l = document.getElementById('ANDI508-alerts-list');
    const sig = (l ? l.innerHTML.length : 0) + ':' + (window.testPageData && window.testPageData.numberOfAccessibilityAlertsFound);
    window.__s = window.__s || { v: null, n: 0 }; if (window.__s.v === sig) window.__s.n++; else { window.__s.v = sig; window.__s.n = 0; } return window.__s.n >= 3;
  }, { timeout: 12000, polling: 200 }); } catch (e) {}
}
const probe = () => {
  const el = (s) => Array.from(document.querySelectorAll('[class*="ANDI508-element-' + s + '"]')).filter(e => !e.closest('#ANDI508')).length;
  const list = document.getElementById('ANDI508-alerts-list');
  const groups = list ? Array.from(list.querySelectorAll('li')).map(g => g.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4) : [];
  return { total: window.testPageData.numberOfAccessibilityAlertsFound, d: el('danger'), w: el('warning'), c: el('caution'), groups };
};

const CSP_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSP target</title></head>
<body><h1>CSP</h1><button></button><!-- focusable danger: no accessible name --></body></html>`;
const SHI = {
  s: `<!doctype html><html lang=en><head><meta charset=utf-8><title>s</title></head><body>
<h1>Real Title</h1><div role="heading">role=heading without aria-level</div></body></html>`,
  h: `<!doctype html><html lang=en><head><meta charset=utf-8><title>h</title>
<style>.inj::before{content:"injected pseudo content";}</style></head><body><h1>h</h1><span class="inj">x</span></body></html>`,
  i: `<!doctype html><html lang=en><head><meta charset=utf-8><title>i</title></head><body>
<h1>i</h1><iframe src="about:blank"></iframe></body></html>`,
};

(async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'" });
    res.end(CSP_HTML);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, base = `http://127.0.0.1:${port}`, CSP_URL = base + '/';
  const browser = await chromium.launch({ headless: true });
  let pass = true;

  console.log("=== A) CSP injection (server header: script-src 'self') ===");
  { // A1: no bypass -> injection refused
    const ext = []; const ctx = await browser.newContext(); const page = await ctx.newPage();
    const outcome = await Promise.race([
      (async () => { await inject(page, CSP_URL, ext, base); await page.waitForFunction(READY, { timeout: 8000 }); return 'ready'; })()
        .catch(e => 'refused:' + String(e && e.message || e).split('\n')[0].slice(0, 60)),
      new Promise(r => setTimeout(() => r('blocked-timeout'), 9000)),
    ]);
    const blocked = outcome !== 'ready';
    console.log(`  A1 no-bypass: ${outcome} -> injection ${blocked ? 'BLOCKED (expected)' : 'NOT blocked (!)'}`);
    if (!blocked) pass = false;
    await ctx.close();
  }
  { // A2 (load-bearing): bypass -> ready + danger + hermetic
    const ext = []; const ctx = await browser.newContext({ bypassCSP: true }); const page = await ctx.newPage();
    let ready = false, p = { d: 0 };
    try { await inject(page, CSP_URL, ext, base); await page.waitForFunction(READY, { timeout: 15000 }); ready = true; } catch (e) {}
    if (ready) { await stable(page); p = await page.evaluate(probe); }
    const ok = ready && p.d >= 1 && ext.length === 0;
    console.log(`  A2 bypassCSP: ready=${ready} danger=${p.d} external=${ext.length} -> ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) pass = false;
    await ctx.close();
  }

  console.log('=== B) s/h/i: alerts-list findings, zero per-element flags (fresh bypassCSP ctx) ===');
  for (const mod of ['s', 'h', 'i']) {
    fs.writeFileSync(`/tmp/andi06-${mod}.html`, SHI[mod]);
    const ext = []; const ctx = await browser.newContext({ bypassCSP: true }); const page = await ctx.newPage();
    let total = null, p = { d: 0, w: 0, c: 0, groups: [] }, err = '';
    try {
      await inject(page, `file:///tmp/andi06-${mod}.html`, ext);
      await page.waitForFunction(READY, { timeout: 15000 });
      await page.evaluate((m) => { window.__s = null; window.AndiModule.launchModule(m); }, mod);
      await stable(page); p = await page.evaluate(probe); total = p.total;
    } catch (e) { err = String(e && e.message || e).split('\n')[0]; }
    const ok = total >= 1; // the alerts-list signal exists (per-element D/W/C is expected 0 here)
    console.log(`  module=${mod} alertTotal=${total} perElement(D/W/C)=${p.d}/${p.w}/${p.c} -> ${ok ? 'PASS' : 'FAIL'} ${err ? '[' + err + ']' : ''}`);
    console.log(`     alerts-list: ${JSON.stringify(p.groups.slice(0, 1))}`);
    if (!ok) pass = false;
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(pass ? 'GROUNDING PASS' : 'GROUNDING FAIL');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('SPIKE ERROR', e && e.stack || e); process.exit(1); });
