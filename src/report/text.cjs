'use strict';
/**
 * src/report/text.cjs — human-readable ANDI scan report.
 *
 * Pure function: toText(result) → string.
 * No I/O, no Date.now() calls (deterministic by design).
 *
 * Mandatory honesty banner (verbatim, per task spec):
 *   "Automated checks cover a subset of Section 508; ANDI surfaces items
 *    for human Trusted-Tester judgment."
 */

/** Map severity letter to a display label. */
const SEV_LABEL = { danger: 'DANGER', warning: 'WARNING', caution: 'CAUTION', info: 'INFO' };

/**
 * Render a human-readable multi-module scan report.
 *
 * @param {object} result  Return value of scan() — shape:
 *   { url, version, findings, counts, worst, andiAlertTotal, externalAttempts,
 *     scannedAt? }
 * @returns {string}
 */
function toText(result) {
  const lines = [];

  lines.push('');
  lines.push('ANDI 508 scan');
  lines.push(`  URL:      ${result.url}`);
  if (result.version) lines.push(`  ANDI:     v${result.version}`);
  if (result.scannedAt) lines.push(`  Scanned:  ${result.scannedAt}`);
  if (typeof result.andiAlertTotal === 'number') {
    lines.push(`  ANDI total alerts reported: ${result.andiAlertTotal}`);
  }
  lines.push('');

  const findings = result.findings || [];

  if (findings.length === 0) {
    lines.push('  No accessibility findings for the scanned module(s).');
  } else {
    // Group by module, then by severity within each module.
    const byModule = {};
    for (const f of findings) {
      const mod = f.module || '(unknown)';
      if (!byModule[mod]) byModule[mod] = [];
      byModule[mod].push(f);
    }

    for (const [mod, modFindings] of Object.entries(byModule)) {
      lines.push(`  Module: ${mod}`);
      // Group by severity within module
      const bySev = {};
      for (const f of modFindings) {
        if (!bySev[f.severity]) bySev[f.severity] = [];
        bySev[f.severity].push(f);
      }
      for (const sev of ['danger', 'warning', 'caution', 'info']) {
        if (!bySev[sev]) continue;
        lines.push(`    [${SEV_LABEL[sev] || sev.toUpperCase()}] (${bySev[sev].length})`);
        for (const f of bySev[sev]) {
          const engineTag = f.engine ? ` [${f.engine}]` : '';
          lines.push(`      •${engineTag} ${f.message}`);
          if (f.alsoFoundBy && f.alsoFoundBy.length > 0) {
            lines.push(`        also found by: ${f.alsoFoundBy.join(', ')}`);
          }
          if (f.element) {
            lines.push(`        element: <${f.element.tag}>`);
          }
        }
      }
      lines.push('');
    }
  }

  // Counts summary
  const counts = result.counts || {};
  const parts = [];
  for (const sev of ['danger', 'warning', 'caution', 'info']) {
    if (counts[sev]) parts.push(`${counts[sev]} ${sev}`);
  }
  if (parts.length) {
    lines.push(`  Summary: ${parts.join(', ')}`);
  } else {
    lines.push('  Summary: 0 findings');
  }

  lines.push('');
  lines.push('  Automated checks cover a subset of Section 508; ANDI surfaces items');
  lines.push('  for human Trusted-Tester judgment.');
  lines.push('');

  return lines.join('\n');
}

module.exports = { toText };
