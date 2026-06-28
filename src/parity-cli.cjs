#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { runParityComparison, formatSummary } = require('./parity.cjs');

const HELP = `andi-parity — compare browser ANDI output with andi-cli output

USAGE:
  andi-parity --url <http(s)://...> [options]
  andi-parity --serve-file <path/to/page.html> [options]

OPTIONS:
  --url <url>                 Target page URL.
  --serve-file <path>         Serve a local file over http://127.0.0.1 and compare that URL.
  --module <key|all|a,b>      ANDI module(s). Default: f.
  --browser-source <source>   live|local. live injects SSA bookmarklet URL. Default: live.
  --timeout <ms>              Per-step timeout. Default: 30000.
  --json                      Print full JSON report.
  --out <file>                Write full JSON report to file.
  --markdown-out <file>       Write markdown summary to file.
  --fail-on-diff              Exit 1 when any module is not exact.
  -h, --help                  Show this help.

NOTES:
  Use --browser-source live for real browser/bookmarklet parity.
  Use --browser-source local for deterministic CI parity against vendored ANDI.
  For live browser parity, prefer --serve-file over file:// URLs.
`;

function parseArgs(argv) {
  const opts = { module: 'f', browserSource: 'live', timeoutMs: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--url': opts.url = next(); break;
      case '--serve-file': opts.serveFile = next(); break;
      case '--module': opts.module = next(); break;
      case '--browser-source': opts.browserSource = next(); break;
      case '--timeout': opts.timeoutMs = parseInt(next(), 10) || 30000; break;
      case '--json': opts.json = true; break;
      case '--out': opts.out = next(); break;
      case '--markdown-out': opts.markdownOut = next(); break;
      case '--fail-on-diff': opts.failOnDiff = true; break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        if (!a.startsWith('-') && !opts.url) opts.url = a;
        else throw new Error(`Unknown option: ${a}`);
    }
  }
  return opts;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream';
}

function startStaticServer(entryFile) {
  const absoluteEntry = path.resolve(entryFile);
  const root = path.dirname(absoluteEntry);
  const entryName = path.basename(absoluteEntry);

  if (!fs.existsSync(absoluteEntry)) {
    throw new Error(`--serve-file does not exist: ${entryFile}`);
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const relativePath = rawPath === '/' ? entryName : rawPath.replace(/^\/+/, '');
      const filePath = path.resolve(root, relativePath);

      if (!filePath.startsWith(root + path.sep) && filePath !== root) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/${encodeURIComponent(entryName)}`,
      });
    });
  });
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`andi-parity: ${error.message}\n\n${HELP}`);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let serverHandle = null;
  try {
    if (opts.serveFile) {
      serverHandle = await startStaticServer(opts.serveFile);
      opts.url = serverHandle.url;
    }

    if (!opts.url) {
      process.stderr.write(HELP);
      process.exit(2);
    }

    const report = await runParityComparison(opts.url, {
      module: opts.module,
      browserSource: opts.browserSource,
      timeoutMs: opts.timeoutMs,
    });
    const summary = formatSummary(report);

    if (opts.out) {
      fs.writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
    }
    if (opts.markdownOut) {
      fs.writeFileSync(opts.markdownOut, summary + '\n');
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      process.stdout.write(summary + '\n');
    }

    if (report.summary.errors > 0) process.exit(2);
    if (opts.failOnDiff && !report.summary.ready) process.exit(1);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`andi-parity: ${error.message}\n`);
    process.exit(2);
  } finally {
    if (serverHandle) serverHandle.server.close();
  }
}

if (require.main === module) main();

module.exports = { parseArgs, startStaticServer };
