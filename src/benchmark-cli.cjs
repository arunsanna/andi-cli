#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  runBenchmark,
  writeReportFiles,
} = require('./benchmark.cjs');

const DEFAULT_FIXTURE = 'test/fixtures/browser-benchmark/live-browser-andi-20-pages.json';

const HELP = `andi benchmark browser-vs-cli

USAGE:
  node src/benchmark-cli.cjs [options]

OPTIONS:
  --fixture <file>     Frozen browser benchmark fixture.
                       Default: ${DEFAULT_FIXTURE}
  --out-dir <dir>      Output directory. Default: results/browser-cli-benchmark/<timestamp>
  --module <key|all>   ANDI modules to benchmark. Default: all.
  --timeout <ms>       Per-step timeout in ms. Default: 45000.
  --headful            Run Chromium headful.
  -h, --help           Show this help.
`;

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function parseArgs(argv) {
  const opts = {
    fixture: DEFAULT_FIXTURE,
    timeoutMs: 45000,
    modules: 'all',
    headless: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--fixture':
        opts.fixture = next();
        break;
      case '--out-dir':
        opts.outDir = next();
        break;
      case '--module':
        opts.modules = next();
        break;
      case '--timeout':
        opts.timeoutMs = parseInt(next(), 10);
        break;
      case '--headful':
        opts.headless = false;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error('--timeout must be a positive number');
  }
  opts.fixture = path.resolve(opts.fixture);
  opts.outDir = path.resolve(opts.outDir || path.join(
    'results',
    'browser-cli-benchmark',
    timestampForPath()
  ));
  return opts;
}

if (require.main === module) {
  (async () => {
    let opts;
    try {
      opts = parseArgs(process.argv.slice(2));
    } catch (error) {
      process.stderr.write(`${error.message}\n\n${HELP}`);
      process.exit(2);
    }

    if (opts.help) {
      process.stdout.write(HELP);
      process.exit(0);
    }

    process.stderr.write(`browser fixture: ${opts.fixture}\n`);
    process.stderr.write(`output dir: ${opts.outDir}\n`);
    process.stderr.write(`modules: ${opts.modules}\n`);
    process.stderr.write(`timeout: ${opts.timeoutMs} ms\n`);

    let report;
    try {
      report = await runBenchmark({
        browserFixturePath: opts.fixture,
        modules: opts.modules,
        timeoutMs: opts.timeoutMs,
        headless: opts.headless,
        onPage: (page, index, total) => {
          const status = page.status === 'ok' ? 'ok' : 'errors';
          process.stderr.write(`[${index}/${total}] ${status} ${page.url} (${Math.round(page.elapsedMs / 1000)}s)\n`);
        },
      });
    } catch (error) {
      process.stderr.write(`benchmark failed: ${error.message || String(error)}\n`);
      process.exit(2);
    }

    const files = writeReportFiles(report, opts.outDir);
    process.stdout.write(JSON.stringify({
      summary: report.summary,
      files,
    }, null, 2) + '\n');

    process.exit(report.summary.errorModules > 0 ? 2 : 0);
  })();
}

module.exports = { parseArgs, timestampForPath };
