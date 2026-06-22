'use strict';
/**
 * DOM-primary ANDI extraction — alerts-list-primary, per-element-enriched.
 *
 * Design (grounded by spikes/05, spikes/06, live DOM probe 2026-06-21):
 *
 *   PRIMARY SOURCE: #ANDI508-alerts-list  →  one Finding per alert-list li.
 *   ENRICHMENT:     .ANDI508-element-{danger,warning,caution} highlighted nodes
 *                   (present only for modules f/c/t/g/l; absent for s/h/i).
 *
 *   Alert↔element correspondence:
 *     The <a data-andi508-relatedindex="N"> inside each alert-list <li> points
 *     to the page element carrying data-andi508-index="N".
 *     When a matching flagged element exists, attach it; otherwise element: null.
 *
 *   Duplication guard:
 *     When launchModule() is called after the initial focusable load,
 *     #ANDI508-alerts-list gets a second #ANDI508-alerts-container appended.
 *     We use the LAST #ANDI508-alerts-container to read the current module's data.
 *
 * Module letter→name map:
 *   f=focusable, g=graphics, l=links, t=tables,
 *   s=structures, c=contrast, h=hidden, i=iframes
 */

const { mapAlert } = require('./wcag-map.cjs');

/** Module letter → canonical name. */
const MODULE_NAMES = {
  f: 'focusable',
  g: 'graphics',
  l: 'links',
  t: 'tables',
  s: 'structures',
  c: 'contrast',
  h: 'hidden',
  i: 'iframes',
};

/**
 * In-page extraction function.  Serializable — runs via page.evaluate().
 *
 * @param {string|null} moduleName  Canonical module name (e.g. 'focusable').
 * @returns {Array<{severity,message,andiRelatedIndex}>}
 */
/* istanbul ignore next — runs in browser context */
function _extractInPage(moduleName) {
  const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
  const sevOf = (cls) =>
    /danger/i.test(cls) ? 'danger' : /warning/i.test(cls) ? 'warning' : /caution/i.test(cls) ? 'caution' : 'info';

  // Use the LAST #ANDI508-alerts-container to handle launchModule() re-renders.
  const list = document.getElementById('ANDI508-alerts-list');
  if (!list) return [];
  const allContainers = list.querySelectorAll('#ANDI508-alerts-container');
  const activeContainer = allContainers.length
    ? allContainers[allContainers.length - 1]
    : list;

  // Build a map from andiIndex → flagged element (excluding ANDI's own UI).
  const elementByIndex = {};
  document
    .querySelectorAll(
      '[class*="ANDI508-element-danger"],[class*="ANDI508-element-warning"],[class*="ANDI508-element-caution"]'
    )
    .forEach((el) => {
      if (el.closest('#ANDI508')) return;
      const idx = el.getAttribute('data-andi508-index');
      if (idx !== null) {
        const idxNum = parseInt(idx, 10);
        if (!elementByIndex[idxNum]) {
          elementByIndex[idxNum] = {
            tag: el.tagName.toLowerCase(),
            html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 300),
            selector: null, // best-effort; set below if possible
            andiIndex: idxNum,
          };
          // Build a best-effort CSS selector (id → tag[data-index]).
          if (el.id) {
            elementByIndex[idxNum].selector = '#' + el.id;
          } else {
            elementByIndex[idxNum].selector =
              el.tagName.toLowerCase() + '[data-andi508-index="' + idxNum + '"]';
          }
        }
      }
    });

  // Iterate alert groups in the active container.
  const rawFindings = [];
  activeContainer
    .querySelectorAll('.ANDI508-alertGroup-container')
    .forEach((group) => {
      const severity = sevOf(group.className);
      group.querySelectorAll('.ANDI508-alertGroup-list > li').forEach((li) => {
        const a = li.querySelector('a[data-andi508-relatedindex]');
        const relatedIndex = a
          ? parseInt(a.getAttribute('data-andi508-relatedindex'), 10)
          : null;
        // Message text: strip the leading icon img alt text if present.
        const msgTxt = txt(li);
        rawFindings.push({ severity, message: msgTxt, andiRelatedIndex: relatedIndex });
      });
    });

  // Enrich with element info.
  return rawFindings.map((raw) => {
    const element =
      raw.andiRelatedIndex !== null && elementByIndex[raw.andiRelatedIndex]
        ? elementByIndex[raw.andiRelatedIndex]
        : null;
    return { severity: raw.severity, message: raw.message, element, moduleName };
  });
}

/**
 * Extract ANDI findings from a Playwright page that has ANDI loaded and stable.
 *
 * @param {import('playwright').Page} page
 * @param {string} moduleKey  Module letter (f/g/l/t/s/c/h/i) or canonical name.
 * @returns {Promise<Array<import('./types').Finding>>}
 */
async function extractFindings(page, moduleKey) {
  // Normalise moduleKey to canonical name.
  const moduleName = MODULE_NAMES[moduleKey] || moduleKey || null;

  const rawList = await page.evaluate(_extractInPage, moduleName);

  return rawList.map((raw) => {
    const mapped = mapAlert(raw.message);
    let rule, wcag;
    if (mapped) {
      rule = mapped.ruleId;
      wcag = mapped.wcag;
    } else {
      // Fallback rule: kebab-slug from the module name.
      rule = moduleName ? moduleName.toLowerCase().replace(/\s+/g, '-') + '-alert' : 'andi-alert';
      wcag = null;
    }
    return {
      engine: 'andi',
      module: moduleName,
      severity: raw.severity,
      rule,
      message: raw.message,
      wcag,
      element: raw.element || null,
    };
  });
}

module.exports = { extractFindings };
