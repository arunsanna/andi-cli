'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const {
  compareCollections,
  runParityComparison,
} = require('../src/parity.cjs');

const PLANTED_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Parity fixture</title></head>
<body>
  <h1>Parity</h1>
  <button></button>
  <a href="/account"></a>
</body>
</html>`;

function startServer(html = PLANTED_HTML) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function execNode(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: path.resolve(__dirname, '..') }, (error, stdout, stderr) => {
      resolve({ code: error?.code || 0, stdout, stderr });
    });
  });
}

test('compareCollections: exact findings produce exact verdict', () => {
  const finding = {
    engine: 'andi',
    module: 'focusable',
    severity: 'danger',
    rule: 'no-accessible-name',
    message: 'Button has no accessible name, innerText, or [title].',
    element: { tag: 'button', selector: 'button[data-andi508-index="1"]', andiIndex: 1, html: '<button></button>' },
  };
  const cli = {
    moduleKey: 'f',
    module: 'focusable',
    andiVersion: '29.2.2',
    moduleVersion: 'fANDI: 7.0.0',
    findings: [finding],
    counts: { danger: 1, warning: 0, caution: 0, info: 0 },
  };
  const browser = {
    moduleKey: 'f',
    module: 'focusable',
    andiVersion: '29.2.2',
    moduleVersion: 'fANDI: 7.0.0',
    findings: [finding],
    counts: { danger: 1, warning: 0, caution: 0, info: 0 },
  };

  const comparison = compareCollections(cli, browser);
  assert.equal(comparison.verdict, 'exact');
  assert.equal(comparison.findingMatch, true);
  assert.deepEqual(comparison.missingInBrowser, []);
  assert.deepEqual(comparison.extraInBrowser, []);
});

test('compareCollections: missing browser finding is reported', () => {
  const cliFinding = {
    engine: 'andi',
    module: 'focusable',
    severity: 'danger',
    rule: 'no-accessible-name',
    message: 'Button has no accessible name, innerText, or [title].',
    element: { tag: 'button', selector: 'button[data-andi508-index="1"]', andiIndex: 1, html: '<button></button>' },
  };
  const cli = {
    moduleKey: 'f',
    module: 'focusable',
    andiVersion: '29.2.2',
    moduleVersion: 'fANDI: 7.0.0',
    findings: [cliFinding],
    counts: { danger: 1, warning: 0, caution: 0, info: 0 },
  };
  const browser = {
    moduleKey: 'f',
    module: 'focusable',
    andiVersion: '29.2.2',
    moduleVersion: 'fANDI: 7.0.0',
    findings: [],
    counts: { danger: 0, warning: 0, caution: 0, info: 0 },
  };

  const comparison = compareCollections(cli, browser);
  assert.equal(comparison.verdict, 'different');
  assert.equal(comparison.missingInBrowser.length, 1);
  assert.equal(comparison.extraInBrowser.length, 0);
});

test('runParityComparison: local browser source exactly matches CLI on HTTP fixture', async () => {
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const report = await runParityComparison(url, {
      module: 'f',
      browserSource: 'local',
      timeoutMs: 30000,
    });
    assert.equal(report.summary.ready, true);
    assert.equal(report.results[0].comparison.verdict, 'exact');
    assert.equal(report.results[0].comparison.versionMatch, true);
    assert.ok(report.results[0].cli.findings.length >= 2);
  } finally {
    server.close();
  }
});

test('parity CLI: --serve-file with local browser source emits JSON report', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'andi-parity-'));
  const file = path.join(dir, 'fixture.html');
  fs.writeFileSync(file, PLANTED_HTML);
  const result = await execNode([
    'src/parity-cli.cjs',
    '--serve-file', file,
    '--module', 'f',
    '--browser-source', 'local',
    '--json',
  ]);

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.ready, true);
  assert.equal(report.results[0].comparison.verdict, 'exact');
});
