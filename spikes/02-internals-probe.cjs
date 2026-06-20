#!/usr/bin/env node
/** Probe the shape of ANDI's internal data objects so the CLI reads real fields. */
const PW = '/Users/jarvis_arunlab/.npm/_npx/fd3bca3c548369c0/node_modules/playwright';
const { chromium } = require(PW);
const ANDI_SRC = 'https://www.ssa.gov/accessibility/andi/andi.js';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const out = {};
  try {
    await page.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const c = document.createElement('div');
      c.innerHTML = '<img src="x.png"><input type="text"><button></button><a href="/x"></a>'
        + '<table><tr><td>a</td><td>b</td></tr></table>';
      document.body.appendChild(c);
    });
    await page.addScriptTag({ url: ANDI_SRC });
    await page.waitForFunction(() => !!window.andiVersionNumber && !!document.getElementById('ANDI508'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    out.probe = await page.evaluate(() => {
      const describe = (o, depth = 0) => {
        if (o === null) return 'null';
        const t = typeof o;
        if (t !== 'object' && t !== 'function') return t + (t === 'string' ? `(${o.slice(0,40)})` : `(${o})`);
        if (Array.isArray(o)) return `array[${o.length}]` + (o.length && depth < 1 ? ' of ' + describe(o[0], depth + 1) : '');
        if (t === 'function') return 'function';
        const keys = Object.keys(o);
        if (depth >= 2) return `object{${keys.length} keys}`;
        const sub = {};
        keys.slice(0, 30).forEach(k => { try { sub[k] = describe(o[k], depth + 1); } catch (e) { sub[k] = 'ERR'; } });
        return sub;
      };
      const res = {};
      res.windowAndiGlobals = Object.keys(window).filter(k => /andi|ANDI|508|testPage|AndiModule|alerter/i.test(k));
      res.andiAlerter = typeof window.andiAlerter === 'object' ? describe(window.andiAlerter) : typeof window.andiAlerter;
      res.testPageData = typeof window.testPageData === 'object' ? describe(window.testPageData) : typeof window.testPageData;
      // look for an aggregate alert collection
      res.alertDomCounts = {
        pageResults: !!document.getElementById('ANDI508-additionalPageResults'),
        alertClassEls: document.querySelectorAll('[class*="alert" i]').length,
        dangerEls: document.querySelectorAll('[class*="danger" i]').length,
        warningEls: document.querySelectorAll('[class*="warning" i]').length,
      };
      // sample testPageData deeper if it holds element arrays
      if (window.testPageData && typeof window.testPageData === 'object') {
        const tpd = window.testPageData;
        res.testPageDataKeys = Object.keys(tpd);
      }
      return res;
    });
  } catch (e) { out.fatal = e.message; }
  finally { await browser.close(); }
  console.log(JSON.stringify(out, null, 2));
})();
