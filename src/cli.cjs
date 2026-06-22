#!/usr/bin/env node
'use strict';
/**
 * andi-scan — headless SSA ANDI Section 508 scanner.
 *
 * Usage:
 *   andi-scan --url https://example.com
 *   andi-scan --url file://$PWD/examples/fixture.html --json --out report.json
 *   andi-scan --url https://staging.app --fail-on danger   # CI gate
 *   andi-scan --url https://staging.app --module all       # all modules
 *   andi-scan --url https://staging.app --strict-offline   # fail if external calls detected
 */

const fs = require('fs');
const { scan } = require('./scanner.cjs');
const { toText } = require('./report/text.cjs');
const { toJson } = require('./report/json.cjs');

const HELP = `andi-scan — headless SSA ANDI Section 508 scanner

USAGE:
  andi-scan --url <url> [options]

OPTIONS:
  --url <url>          Page to scan (http(s):// or file://). Required.
  --json               Print full results as JSON to stdout.
  --out <file>         Write JSON results to <file>.
  --screenshot <file>  Save a full-page screenshot of the ANDI run.
  --module <key|all>   ANDI module(s): f=focusable (default), g=graphics,
                       l=links, t=tables, s=structures, c=contrast,
                       h=hidden, i=iframes, all=run all modules.
  --fail-on <level>    Exit 1 when worst finding severity >= level:
                       danger|warning|caution|none. Default: danger.
  --strict-offline     Exit 2 if any external network requests were attempted
                       during the scan (enforces hermetic operation).
  --timeout <ms>       Per-step timeout in ms (default 30000).
  --quiet              Suppress the human-readable report (use with --json/--out).
  -h, --help           Show this help.

EXIT CODES:
  0  no findings at/above --fail-on, or --fail-on none
  1  findings at/above --fail-on threshold
  2  scan error, or --strict-offline triggered by external requests

Automated checks cover a subset of Section 508; ANDI surfaces items
for human Trusted-Tester judgment.
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
      case '--strict-offline': o.strictOffline = true; break;
      case '-h': case '--help': o.help = true; break;
      default:
        if (!a.startsWith('-') && !o.url) o.url = a;
        else { process.stderr.write(`Unknown option: ${a}\n`); o.help = true; }
    }
  }
  return o;
}

/** Severity rank — higher number = more severe. */
const SEV_RANK = { caution: 1, warning: 2, danger: 3 };

/**
 * Determine the exit code for a completed scan result.
 *
 * @param {object} result   scan() return value.
 * @param {string} failOn   'danger'|'warning'|'caution'|'none'
 * @returns {0|1}
 */
function exitCodeForFindings(result, failOn) {
  if (failOn === 'none') return 0;

  // worst is null when there are no findings — clean page → exit 0.
  // CRITICAL: compare to null, NOT to the string 'none' (carry-forward fix).
  if (result.worst === null || result.worst === undefined) return 0;

  const worstRank = SEV_RANK[result.worst] ?? 0;
  const threshold = SEV_RANK[failOn] ?? SEV_RANK.danger;

  return worstRank >= threshold ? 1 : 0;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.url) {
    process.stdout.write(HELP);
    process.exit(opts.url ? 0 : 2);
  }

  const scannedAt = new Date().toISOString();

  let result;
  try {
    result = await scan(opts.url, {
      andiSrc: opts.andiSrc,
      modules: opts.module,
      timeoutMs: opts.timeout,
      screenshot: opts.screenshot,
    });
  } catch (e) {
    process.stderr.write(`andi-scan: scan failed — ${e.message}\n`);
    process.exit(2);
  }

  // --strict-offline check (V14): exit 2 if any external requests were attempted.
  if (opts.strictOffline && result.externalAttempts && result.externalAttempts.length > 0) {
    process.stderr.write('andi-scan: --strict-offline: external network requests detected:\n');
    for (const u of result.externalAttempts) {
      process.stderr.write(`  ${u}\n`);
    }
    process.exit(2);
  }

  // Output
  if (opts.out) {
    const jsonReport = toJson(result, scannedAt);
    fs.writeFileSync(opts.out, JSON.stringify(jsonReport, null, 2));
  }
  if (opts.json) {
    const jsonReport = toJson(result, scannedAt);
    process.stdout.write(JSON.stringify(jsonReport, null, 2) + '\n');
  }
  if (!opts.quiet && !opts.json) {
    process.stdout.write(toText({ ...result, scannedAt }));
  }

  process.exit(exitCodeForFindings(result, opts.failOn));
})();
