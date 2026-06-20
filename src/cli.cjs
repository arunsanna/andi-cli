#!/usr/bin/env node
'use strict';
/**
 * andi-scan — headless SSA ANDI Section 508 scanner.
 *
 * Usage:
 *   andi-scan --url https://example.com
 *   andi-scan --url file://$PWD/examples/fixture.html --json --out report.json
 *   andi-scan --url https://staging.app --fail-on danger   # CI gate
 */

const fs = require('fs');
const { scan } = require('./scanner.cjs');

const HELP = `andi-scan — headless SSA ANDI Section 508 scanner

USAGE:
  andi-scan --url <url> [options]

OPTIONS:
  --url <url>          Page to scan (http(s):// or file://). Required.
  --json               Print full results as JSON to stdout.
  --out <file>         Write JSON results to <file>.
  --screenshot <file>  Save a full-page screenshot of the ANDI run.
  --andi-src <url>     Override the andi.js source (default: official SSA URL).
  --module <f|g|l|t|s|c|h|i>
                       ANDI module: f=focusable (default), g=graphics/images,
                       l=links/buttons, t=tables, s=structures, c=color contrast,
                       h=hidden, i=iframes.
                       NOTE: v1 validates the focusable module only; other modules
                       are experimental (reliable multi-module aggregation is Phase 2).
  --fail-on <level>    Exit non-zero when findings >= level: danger|warning|caution|any|none.
                       Default: danger.
  --timeout <ms>       Per-step timeout in ms (default 30000).
  --quiet              Suppress the human-readable report (use with --json/--out).
  -h, --help           Show this help.

EXIT CODES:
  0  no findings at/above --fail-on
  1  findings at/above --fail-on
  2  scan error
`;

function parseArgs(argv) {
  const o = { failOn: 'danger', timeout: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--url': o.url = next(); break;
      case '--json': o.json = true; break;
      case '--out': o.out = next(); break;
      case '--screenshot': o.screenshot = next(); break;
      case '--andi-src': o.andiSrc = next(); break;
      case '--module': o.module = next(); break;
      case '--fail-on': o.failOn = next(); break;
      case '--timeout': o.timeout = parseInt(next(), 10); break;
      case '--quiet': o.quiet = true; break;
      case '-h': case '--help': o.help = true; break;
      default:
        if (!a.startsWith('-') && !o.url) o.url = a;
        else { console.error(`Unknown option: ${a}`); o.help = true; }
    }
  }
  return o;
}

const SEV_RANK = { none: 0, caution: 1, warning: 2, danger: 3, any: 1 };

function worstSeverity(result) {
  let worst = 0;
  for (const a of (result.alerts || [])) worst = Math.max(worst, SEV_RANK[a.severity] || 0);
  return worst;
}

function renderReport(r) {
  const lines = [];
  lines.push('');
  lines.push(`ANDI 508 scan — ${r.url}`);
  lines.push(`  ANDI v${r.andiVersion} · module: ${r.module} · ${r.scannedAt}`);
  lines.push(`  Focusable elements: ${r.focusableCount ?? '?'} · Accessibility alerts: ${r.totalAlerts ?? '?'}`);
  if (r.pageSummary) lines.push(`  Summary: ${r.pageSummary}`);
  const alerts = r.alerts || [];
  if (alerts.length) {
    lines.push('');
    lines.push('  Alerts:');
    for (const a of alerts) lines.push(`    [${a.severity}] ${a.group ? a.group + ' — ' : ''}${a.message}`);
  } else {
    lines.push('  No alerts for this module.');
  }
  if ((r.flaggedElements || []).length) {
    lines.push('');
    lines.push('  Flagged elements:');
    for (const e of r.flaggedElements) lines.push(`    [${e.severity}] <${e.tag}> ${e.html}`);
  }
  if (r.failedRequests && r.failedRequests.length) {
    lines.push('');
    lines.push(`  Failed page requests (${r.failedRequests.length}): ${r.failedRequests.slice(0, 5).join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.url) { process.stdout.write(HELP); process.exit(opts.url ? 0 : 2); }

  let result;
  try {
    result = await scan(opts.url, { andiSrc: opts.andiSrc, module: opts.module, timeoutMs: opts.timeout, screenshot: opts.screenshot });
  } catch (e) {
    console.error(`andi-scan: scan failed — ${e.message}`);
    process.exit(2);
  }

  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(result, null, 2));
  if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!opts.quiet && !opts.json) process.stdout.write(renderReport(result));

  const threshold = SEV_RANK[opts.failOn] ?? SEV_RANK.danger;
  if (opts.failOn === 'none') process.exit(0);
  process.exit(worstSeverity(result) >= threshold ? 1 : 0);
})();
