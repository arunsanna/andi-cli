#!/usr/bin/env node
/** Dump ANDI's real alert DOM structure so the scanner's selectors are evidence-based. */
const { chromium } = require('playwright');
const path = require('path');
const FIXTURE = 'file://' + path.resolve(__dirname, '../examples/fixture.html');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const out = {};
  try {
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ url: 'https://www.ssa.gov/accessibility/andi/andi.js' });
    await page.waitForFunction(() => !!window.andiVersionNumber && !!document.getElementById('ANDI508'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    out.dump = await page.evaluate(() => {
      const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
      const byId = (id) => ({ exists: !!document.getElementById(id), text: txt(document.getElementById(id)) });
      // every element whose class mentions alert/danger/warning/caution
      const alertEls = Array.from(document.querySelectorAll('[class*="alert" i],[class*="danger" i],[class*="warning" i],[class*="caution" i]'))
        .slice(0, 30)
        .map((e) => ({ tag: e.tagName, id: e.id || null, cls: e.className, text: txt(e) }));
      // ids that look results/summary/alert related
      const relevantIds = Array.from(document.querySelectorAll('[id^="ANDI508"]'))
        .map((e) => e.id)
        .filter((id) => /result|summary|alert|analysis|output|pageData|details/i.test(id));
      const tpd = window.testPageData || {};
      return {
        candidates: {
          'ANDI508-additionalPageResults': byId('ANDI508-additionalPageResults'),
          'ANDI508-startUpSummary': byId('ANDI508-startUpSummary'),
          'ANDI508-outputText': byId('ANDI508-outputText'),
          'ANDI508-activeElementResults': byId('ANDI508-activeElementResults'),
          'ANDI508-pageAnalysis': byId('ANDI508-pageAnalysis'),
        },
        relevantIds,
        alertElsCount: document.querySelectorAll('[class*="alert" i]').length,
        alertEls,
        testPageData: {
          numberOfAccessibilityAlertsFound: tpd.numberOfAccessibilityAlertsFound,
          pageAlerts_len: Array.isArray(tpd.pageAlerts) ? tpd.pageAlerts.length : typeof tpd.pageAlerts,
        },
        andiAlerter_dangers_len: (window.andiAlerter && Array.isArray(window.andiAlerter.dangers)) ? window.andiAlerter.dangers.length : null,
        andiAlerter_danger_sample: (window.andiAlerter && window.andiAlerter.dangers && window.andiAlerter.dangers[0])
          ? String(window.andiAlerter.dangers[0]).slice(0, 200) : null,
      };
    });
  } catch (e) { out.fatal = e.message; }
  finally { await browser.close(); }
  console.log(JSON.stringify(out, null, 2));
})();
