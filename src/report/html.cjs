'use strict';
/**
 * src/report/html.cjs — self-contained HTML scan report for VPAT/ACR authors.
 *
 * Pure function: toHtml(result) → string (complete <!doctype html>…</html> document).
 *
 * Security: all user/ANDI-derived text (messages, element.html, rules, selectors)
 * is HTML-entity escaped before embedding. Element snippets are untrusted page
 * markup — a raw <script> in a snippet must not execute or break the report.
 *
 * Mandatory honesty banner (verbatim):
 *   "Automated checks cover a subset of Section 508; ANDI surfaces items for
 *    human Trusted-Tester judgment."
 *
 * Structure: counts summary → per-URL → per-module → per-severity → findings.
 * Findings without an element (element:null) are rendered as page-level.
 */

const PKG_VERSION = require('../../package.json').version;

/** HTML-entity escape for embedding untrusted text into HTML content/attributes. */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Severity → display label + CSS class. */
const SEV_META = {
  danger:  { label: 'DANGER',  cls: 'sev-danger'  },
  warning: { label: 'WARNING', cls: 'sev-warning' },
  caution: { label: 'CAUTION', cls: 'sev-caution' },
  info:    { label: 'INFO',    cls: 'sev-info'    },
};

/** Ordered severity levels for grouping. */
const SEV_ORDER = ['danger', 'warning', 'caution', 'info'];

/**
 * Render one finding row.
 * @param {object} f  Finding object.
 * @returns {string}  HTML fragment.
 */
function renderFinding(f) {
  const meta = SEV_META[f.severity] || { label: esc(f.severity).toUpperCase(), cls: 'sev-info' };
  const wcagTags = Array.isArray(f.wcag) && f.wcag.length
    ? f.wcag.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')
    : '';

  let elementBlock;
  if (f.element) {
    elementBlock = `
        <div class="element-snippet">
          <span class="label">Element snippet:</span>
          <code>${esc(f.element.html)}</code>
        </div>`;
  } else {
    elementBlock = `
        <div class="element-page-level">(page-level — no specific element)</div>`;
  }

  return `
      <div class="finding">
        <div class="finding-header">
          <span class="sev-badge ${meta.cls}">${meta.label}</span>
          <span class="rule">${esc(f.rule)}</span>
          ${wcagTags}
        </div>
        <div class="finding-message">${esc(f.message)}</div>
        ${elementBlock}
      </div>`;
}

/**
 * Render findings for one (url, module, severity) group.
 * Returns '' when the group is empty.
 */
function renderGroup(findings) {
  if (!findings || findings.length === 0) return '';
  return findings.map(renderFinding).join('');
}

/**
 * Produce a self-contained HTML document string for the scan result.
 *
 * @param {object} result  Return value of scan() — shape:
 *   { url, version?, scannedAt?, findings, counts, worst, andiAlertTotal }
 * @returns {string}  Complete HTML document.
 */
function toHtml(result) {
  const url = result.url || '(unknown)';
  const scannedAt = result.scannedAt || null;
  const counts = result.counts || { danger: 0, warning: 0, caution: 0, info: 0 };
  const worst = result.worst || null;
  const andiAlertTotal = result.andiAlertTotal ?? null;
  const findings = result.findings || [];

  // --- Counts summary badges ---
  const countsBadges = SEV_ORDER
    .filter((s) => counts[s] != null)
    .map((s) => {
      const meta = SEV_META[s];
      return `<span class="count-badge ${meta.cls}">${counts[s]} ${meta.label}</span>`;
    })
    .join(' ');

  // --- Group findings by url → module → severity ---
  // Since this reporter handles a single-URL result (same as text/json/junit),
  // we group by module then severity.
  const byModule = {};
  for (const f of findings) {
    const mod = f.module || '(unknown)';
    if (!byModule[mod]) byModule[mod] = {};
    const bySev = byModule[mod];
    if (!bySev[f.severity]) bySev[f.severity] = [];
    bySev[f.severity].push(f);
  }

  let findingsSections = '';
  if (findings.length === 0) {
    findingsSections = '<p class="no-findings">No accessibility findings for the scanned module(s).</p>';
  } else {
    for (const [mod, bySev] of Object.entries(byModule)) {
      let moduleFindings = '';
      for (const sev of SEV_ORDER) {
        const group = bySev[sev];
        if (!group || group.length === 0) continue;
        moduleFindings += `
      <div class="sev-group">
        <h4 class="sev-heading ${SEV_META[sev]?.cls || ''}">${SEV_META[sev]?.label || esc(sev.toUpperCase())} (${group.length})</h4>
        ${renderGroup(group)}
      </div>`;
      }
      findingsSections += `
    <section class="module-section">
      <h3 class="module-heading">Module: ${esc(mod)}</h3>
      ${moduleFindings}
    </section>`;
    }
  }

  const worstLine = worst
    ? `<p class="meta-line">Worst severity: <span class="sev-badge ${SEV_META[worst]?.cls || ''}">${esc(worst).toUpperCase()}</span></p>`
    : '';

  const andiTotalLine = andiAlertTotal != null
    ? `<p class="meta-line">ANDI total alerts reported: <strong>${esc(String(andiAlertTotal))}</strong></p>`
    : '';

  const scannedLine = scannedAt
    ? `<p class="meta-line">Scanned: ${esc(scannedAt)}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANDI 508 Scan Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; color: #1a1a1a; background: #f9f9f9; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  h2 { font-size: 1.15rem; margin: 1.25rem 0 0.4rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  h3.module-heading { font-size: 1rem; margin: 1rem 0 0.35rem; color: #333; }
  h4.sev-heading { font-size: 0.9rem; margin: 0.75rem 0 0.3rem; }
  .honesty-banner { background: #fff8dc; border: 1px solid #e6c84a; border-radius: 4px; padding: 0.65rem 1rem; margin-bottom: 1.25rem; font-size: 0.9rem; }
  .url-section { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
  .meta-line { margin: 0.2rem 0; font-size: 0.88rem; color: #444; }
  .counts-row { margin: 0.5rem 0 0.75rem; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .count-badge, .sev-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
  .sev-danger  { background: #fde8e8; color: #b91c1c; border: 1px solid #f5a5a5; }
  .sev-warning { background: #fff3e0; color: #b45309; border: 1px solid #f9c96a; }
  .sev-caution { background: #fffbe6; color: #854d0e; border: 1px solid #e5d57a; }
  .sev-info    { background: #e8f4fd; color: #1e40af; border: 1px solid #93c5fd; }
  .module-section { margin-bottom: 1rem; }
  .sev-group { margin-bottom: 0.75rem; }
  .finding { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 4px; padding: 0.65rem 0.85rem; margin-bottom: 0.5rem; }
  .finding-header { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-bottom: 0.35rem; }
  .rule { font-family: monospace; font-size: 0.82rem; color: #555; }
  .tag { display: inline-block; background: #eef2ff; color: #3730a3; border: 1px solid #c7d2fe; border-radius: 3px; font-size: 0.75rem; padding: 0.05rem 0.35rem; }
  .finding-message { font-size: 0.9rem; margin: 0.2rem 0; }
  .element-snippet { margin-top: 0.4rem; font-size: 0.82rem; }
  .element-snippet .label { color: #666; margin-right: 0.3rem; }
  .element-snippet code { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 3px; padding: 0.1rem 0.3rem; font-size: 0.8rem; word-break: break-all; }
  .element-page-level { font-size: 0.82rem; color: #888; font-style: italic; margin-top: 0.3rem; }
  .no-findings { color: #166534; background: #dcfce7; border: 1px solid #86efac; border-radius: 4px; padding: 0.65rem 1rem; }
  footer { margin-top: 2rem; font-size: 0.78rem; color: #999; border-top: 1px solid #e5e5e5; padding-top: 0.75rem; }
</style>
</head>
<body>
<h1>ANDI 508 Scan Report</h1>
<div class="honesty-banner" role="note">
  Automated checks cover a subset of Section 508; ANDI surfaces items for human Trusted-Tester judgment.
</div>

<section class="url-section">
  <h2>URL: ${esc(url)}</h2>
  ${scannedLine}
  ${worstLine}
  ${andiTotalLine}
  <div class="counts-row" aria-label="Finding counts">${countsBadges}</div>
  ${findingsSections}
</section>

<footer>
  Generated by andi-cli v${esc(PKG_VERSION)} &mdash; <a href="https://www.ssa.gov/accessibility/andi/help/install.html">ANDI v${esc(result.version || '?')}</a>
</footer>
</body>
</html>`;
}

module.exports = { toHtml };
