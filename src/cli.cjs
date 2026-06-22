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
 *   andi-scan --urls urls.txt                              # scan a list of URLs
 *   andi-scan --sitemap sitemap.xml                        # scan URLs from a sitemap
 *   andi-scan --sitemap https://example.com/sitemap.xml --concurrency 3
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { scan } = require('./scanner.cjs');
const { parseSitemap, readUrlsFile, scanUrls } = require('./sitemap.cjs');
const { toText } = require('./report/text.cjs');
const { toJson } = require('./report/json.cjs');
const { toSarif } = require('./report/sarif.cjs');
const { toHtml } = require('./report/html.cjs');

const HELP = `andi-scan — headless SSA ANDI Section 508 scanner

USAGE:
  andi-scan --url <url> [options]
  andi-scan --urls <file> [options]
  andi-scan --sitemap <url|file> [options]

OPTIONS:
  --url <url>          Page to scan (http(s):// or file://). Required unless
                       --urls or --sitemap is given.
  --urls <file>        Newline-separated file of URLs to scan (# = comment).
  --sitemap <url|file> Sitemap XML to fetch/read; scan all <loc> entries.
  --concurrency <n>    Number of pages to scan in parallel (default 1).
  --json               Print full results as JSON to stdout.
  --out <file>         Write JSON results to <file>.
  --sarif <file>       Write SARIF 2.1.0 results to <file> (for GitHub code scanning).
  --html <file>        Write self-contained HTML report to <file>.
  --module <key|all>   ANDI module(s): f=focusable (default), g=graphics,
                       l=links, t=tables, s=structures, c=contrast,
                       h=hidden, i=iframes, all=run all modules.
  --fail-on <level>    Exit 1 when worst finding severity >= level:
                       danger|warning|caution|none. Default: danger.
  --strict-offline     Exit 2 if any external network requests were attempted
                       during the scan (enforces hermetic operation).
  --with-axe           Also run axe-core engine alongside ANDI (Phase 3).
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
  const o = { failOn: 'danger', timeout: 30000, concurrency: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--url': o.url = next(); break;
      case '--urls': o.urlsFile = next(); break;
      case '--sitemap': o.sitemap = next(); break;
      case '--concurrency': o.concurrency = parseInt(next(), 10) || 1; break;
      case '--json': o.json = true; break;
      case '--out': o.out = next(); break;
      case '--sarif': o.sarif = next(); break;
      case '--html': o.html = next(); break;
      case '--module': o.module = next(); break;
      case '--fail-on': o.failOn = next(); break;
      case '--timeout': o.timeout = parseInt(next(), 10); break;
      case '--quiet': o.quiet = true; break;
      case '--strict-offline': o.strictOffline = true; break;
      case '--with-axe': o.withAxe = true; break;
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
 * Pure exit-code function for unit testing.
 *
 * @param {string|null|undefined} worst  Worst severity seen: 'danger'|'warning'|'caution'|null|undefined
 * @param {string} failOn                Threshold: 'danger'|'warning'|'caution'|'none'
 * @returns {0|1}
 */
function exitCode(worst, failOn) {
  if (failOn === 'none') return 0;
  if (worst === null || worst === undefined) return 0;
  const worstRank = SEV_RANK[worst] ?? 0;
  const threshold = SEV_RANK[failOn] ?? SEV_RANK.danger;
  return worstRank >= threshold ? 1 : 0;
}

/**
 * Determine the exit code for a completed scan result.
 *
 * @param {object} result   scan() return value.
 * @param {string} failOn   'danger'|'warning'|'caution'|'none'
 * @returns {0|1}
 */
function exitCodeForFindings(result, failOn) {
  return exitCode(result.worst, failOn);
}

module.exports = { exitCode };

// ---------------------------------------------------------------------------
// Fetch a URL string (http/https) or read a local file path, returning text.
// ---------------------------------------------------------------------------
function fetchOrRead(urlOrPath) {
  // If it looks like http(s)://, fetch it.
  if (/^https?:\/\//i.test(urlOrPath)) {
    return new Promise((resolve, reject) => {
      const lib = urlOrPath.startsWith('https') ? https : http;
      lib.get(urlOrPath, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
  // Otherwise treat as a local file path.
  const filePath = urlOrPath.startsWith('file://')
    ? urlOrPath.replace(/^file:\/\//, '')
    : urlOrPath;
  return Promise.resolve(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) (async () => {
  const opts = parseArgs(process.argv.slice(2));

  // Determine mode: multi-URL (--urls or --sitemap) vs single (--url).
  const isMulti = !!(opts.urlsFile || opts.sitemap);

  if (opts.help || (!opts.url && !isMulti)) {
    process.stdout.write(HELP);
    process.exit(opts.url || isMulti ? 0 : 2);
  }

  const scannedAt = new Date().toISOString();

  // -------------------------------------------------------------------------
  // Multi-URL mode: --urls or --sitemap
  // -------------------------------------------------------------------------
  if (isMulti) {
    let urls = [];

    if (opts.urlsFile) {
      let text;
      try {
        text = fs.readFileSync(opts.urlsFile, 'utf8');
      } catch (e) {
        process.stderr.write(`andi-scan: cannot read --urls file: ${e.message}\n`);
        process.exit(2);
      }
      urls = readUrlsFile(text);
    } else if (opts.sitemap) {
      let xml;
      try {
        xml = await fetchOrRead(opts.sitemap);
      } catch (e) {
        process.stderr.write(`andi-scan: cannot read --sitemap: ${e.message}\n`);
        process.exit(2);
      }
      urls = parseSitemap(xml);
    }

    if (urls.length === 0) {
      process.stderr.write('andi-scan: no URLs found in input\n');
      process.exit(2);
    }

    let multiResult;
    try {
      multiResult = await scanUrls(urls, {
        modules: opts.module,
        timeoutMs: opts.timeout,
        concurrency: opts.concurrency,
      });
    } catch (e) {
      process.stderr.write(`andi-scan: multi-URL scan failed — ${e.message}\n`);
      process.exit(2);
    }

    // A per-URL scan error forces exit 2 regardless of --fail-on.
    if (multiResult.hasErrors) {
      for (const err of multiResult.errors) {
        process.stderr.write(`andi-scan: scan error for ${err.url} — ${err.error}\n`);
      }
    }

    // --strict-offline: exit 2 if any external requests were attempted across all pages.
    if (opts.strictOffline && multiResult.externalAttempts && multiResult.externalAttempts.length > 0) {
      process.stderr.write('andi-scan: --strict-offline: external network requests detected:\n');
      for (const { page, attempt } of multiResult.externalAttempts) {
        process.stderr.write(`  [${page}] ${attempt}\n`);
      }
      process.exit(2);
    }

    // Output (reuse same reporters; result shape is compatible)
    if (opts.out) {
      const jsonReport = toJson(multiResult, scannedAt);
      fs.writeFileSync(opts.out, JSON.stringify(jsonReport, null, 2));
    }
    if (opts.sarif) {
      fs.writeFileSync(opts.sarif, JSON.stringify(toSarif(multiResult), null, 2));
    }
    if (opts.html) {
      fs.writeFileSync(opts.html, toHtml({ ...multiResult, scannedAt }));
    }
    if (opts.json) {
      const jsonReport = toJson(multiResult, scannedAt);
      process.stdout.write(JSON.stringify(jsonReport, null, 2) + '\n');
    }
    if (!opts.quiet && !opts.json) {
      process.stdout.write(toText({ ...multiResult, scannedAt }));
    }

    // Exit 2 if any URL errored; otherwise use normal worst-based exit code.
    if (multiResult.hasErrors) process.exit(2);
    process.exit(exitCodeForFindings(multiResult, opts.failOn));
  }

  // -------------------------------------------------------------------------
  // Single-URL mode: --url
  // -------------------------------------------------------------------------
  let result;
  try {
    result = await scan(opts.url, {
      modules: opts.module,
      timeoutMs: opts.timeout,
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
  if (opts.sarif) {
    fs.writeFileSync(opts.sarif, JSON.stringify(toSarif(result), null, 2));
  }
  if (opts.html) {
    fs.writeFileSync(opts.html, toHtml({ ...result, scannedAt }));
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
