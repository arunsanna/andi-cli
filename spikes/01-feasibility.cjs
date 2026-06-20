#!/usr/bin/env node
/**
 * ANDI headless feasibility spike (v2 — alert extraction).
 * Q: Can the SSA ANDI bookmarklet run headless AND yield scrapable per-element 508 alerts?
 */
const PW = '/Users/jarvis_arunlab/.npm/_npx/fd3bca3c548369c0/node_modules/playwright';
const { chromium } = require(PW);

const TARGET = 'https://example.com/';
const ANDI_SRC = 'https://www.ssa.gov/accessibility/andi/andi.js';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();

  const consoleMsgs = [];
  const failedReqs = [];
  page.on('console', m => consoleMsgs.push(`${m.type()}: ${m.text()}`.slice(0, 200)));
  page.on('pageerror', e => consoleMsgs.push(`pageerror: ${e.message}`.slice(0, 200)));
  page.on('response', r => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url()}`); });

  const out = { target: TARGET };
  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 20000 });

    await page.evaluate(() => {
      const c = document.createElement('div');
      c.id = 'spike-fixture';
      c.innerHTML =
        '<h2>Spike fixture</h2>' +
        '<img src="https://example.com/missing.png" width="80" height="80">' +
        '<input type="text" placeholder="email">' +
        '<button></button>' +
        '<a href="https://example.com/x"></a>' +
        '<p style="color:#cfcfcf;background:#dddddd">low contrast paragraph</p>';
      document.body.appendChild(c);
    });

    await page.addScriptTag({ url: ANDI_SRC });

    // wait for ANDI to build its UI
    await page.waitForFunction(() => !!window.andiVersionNumber && !!document.getElementById('ANDI508'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    out.extract = await page.evaluate(async () => {
      const txt = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const collectAlerts = () => Array.from(document.querySelectorAll('[class*="alert" i]'))
        .map(e => txt(e)).filter(t => t && t.length > 2);

      const result = {
        version: window.andiVersionNumber,
        startupSummary: txt(document.getElementById('ANDI508-startUpSummary')),
        pageAnalysis: txt(document.getElementById('ANDI508-additionalPageResults'))
                   || txt(document.getElementById('ANDI508-pageAnalysis')),
        globals: {
          andiAlerter: typeof window.andiAlerter,
          testPageData: typeof window.testPageData,
          AndiModule: typeof window.AndiModule,
          andiResetDefaults: typeof window.andiResetDefaults,
        },
      };

      // step through ANDI's element list, harvest per-element alerts
      const nextBtn = document.getElementById('ANDI508-button-nextElement');
      const harvested = [];
      const seen = new Set();
      if (nextBtn) {
        for (let i = 0; i < 30; i++) {
          const name = txt(document.getElementById('ANDI508-outputText'));
          const alerts = collectAlerts();
          const key = (name || '') + '|' + alerts.join('||');
          if (!seen.has(key)) {
            seen.add(key);
            if (alerts.length) harvested.push({ activeElement: name, alerts });
          }
          nextBtn.click();
          await sleep(120);
        }
      }
      result.elementsStepped = seen.size;
      result.perElementAlerts = harvested.slice(0, 25);
      return result;
    });

    await page.screenshot({ path: '/tmp/andi-spike/andi.png', fullPage: true });
  } catch (e) {
    out.fatal = e.message;
  } finally {
    out.failedRequests = failedReqs.slice(0, 10);
    out.console = consoleMsgs.slice(0, 20);
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 2));
})();
