"use strict";

/**
 * src/engines/axe.cjs — optional axe-core adapter (Task 3.1).
 *
 * Runs axe-core on a CLEAN page (no ANDI injection) via @axe-core/playwright.
 * Off by default; @axe-core/playwright is an optionalDependency.
 *
 * Exports:
 *   runAxe(browser, url, opts) → Finding[]
 *   _transformWcagTag(tag)     → string (testable helper; internal use)
 */

const IMPACT = {
  critical: "danger",
  serious: "warning",
  moderate: "caution",
  minor: "info",
};

/**
 * Transform a single axe WCAG tag to a dot-separated criterion string.
 * Accepts criterion-code tags only (e.g. wcag412 → '4.1.2', wcag1411 → '4.1.11').
 * Level tags (wcag2a, wcag2aa, wcag21aa, etc.) do not match and must be
 * filtered before calling this function.
 *
 * @param {string} tag - e.g. 'wcag412', 'wcag1411'
 * @returns {string} - e.g. '4.1.2', '4.1.11'
 */
function _transformWcagTag(tag) {
  const d = tag.replace(/^wcag/, "");
  // d[0] = major, d[1] = minor-major, d.slice(2) = minor-minor (may be >1 digit)
  return [d[0], d[1], d.slice(2)].join(".");
}

/**
 * Run axe-core against url on a fresh context (bypassCSP:true, no ANDI).
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<Finding[]>}
 */
async function runAxe(browser, url, opts = {}) {
  let AxeBuilder;
  try {
    ({ AxeBuilder } = require("@axe-core/playwright"));
  } catch {
    throw new Error("Install @axe-core/playwright to use --with-axe");
  }

  const ctx = await browser.newContext({ bypassCSP: true });
  const page = await ctx.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: opts.timeoutMs || 30000,
    });
    const res = await new AxeBuilder({ page }).analyze();
    return res.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        engine: "axe",
        module: null,
        severity: IMPACT[v.impact] || "info",
        rule: v.id,
        message: v.help,
        wcag: v.tags
          .filter((t) => /^wcag\d{3,4}$/.test(t)) // criterion codes only; skip level tags like wcag2a
          .map(_transformWcagTag),
        element: {
          tag: (n.html.match(/^<(\w+)/) || [])[1] || "",
          html: n.html,
          selector: Array.isArray(n.target) ? n.target.join(" ") : null,
          andiIndex: null,
        },
      }))
    );
  } finally {
    await ctx.close();
  }
}

module.exports = { runAxe, _transformWcagTag };
