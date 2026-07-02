'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverHtmlFiles,
  scanDirectory,
  startStaticServer,
} = require('../src/directory.cjs');

const CLI = path.resolve(__dirname, '..', 'src', 'cli.cjs');

function runCli(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { timeout: opts.timeout ?? 120000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

function makeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'andi-dir-site-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.mkdirSync(path.join(root, 'node_modules'));

  fs.writeFileSync(path.join(root, 'assets', 'app.js'), [
    'const a = document.createElement("a");',
    'a.href = "/nested/page.htm";',
    'document.body.appendChild(a);',
  ].join('\n'));

  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Directory fixture</title><script src="/assets/app.js" defer></script></head>
<body><main><h1>Directory fixture</h1><button></button></main></body>
</html>`);

  fs.writeFileSync(path.join(root, 'nested', 'page.htm'), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Nested directory fixture</title></head>
<body><main><h1>Nested page</h1><a href="/"></a></main></body>
</html>`);

  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.html'), '<button></button>');
  return root;
}

test('discoverHtmlFiles: finds html/htm recursively and skips node_modules', () => {
  const root = makeSite();
  const files = discoverHtmlFiles(root).map((file) => path.relative(root, file));

  assert.deepEqual(files, ['index.html', path.join('nested', 'page.htm')]);
});

test('startStaticServer: serves local assets from the directory root', async () => {
  const root = makeSite();
  const server = await startStaticServer(root);
  try {
    const body = await new Promise((resolve, reject) => {
      require('http').get(server.origin + '/assets/app.js', (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve(text));
      }).on('error', reject);
    });

    assert.ok(body.includes('document.createElement'), 'served JS asset should come from local directory');
  } finally {
    await server.close();
  }
});

test('scanDirectory: renders local pages over localhost and aggregates findings', async (t) => {
  t.timeout = 120000;

  const root = makeSite();
  const result = await scanDirectory(root, {
    modules: 'f',
    strictOffline: true,
    concurrency: 1,
  });

  assert.equal(result.directory, root);
  assert.deepEqual(result.files, ['index.html', path.join('nested', 'page.htm')]);
  assert.equal(result.urls.length, 2);
  assert.equal(result.andiVersion, '29.2.2');
  assert.equal(result.worst, 'danger');
  assert.ok((result.counts.danger || 0) >= 2, `expected directory dangers, got ${JSON.stringify(result.counts)}`);
  assert.equal(result.externalAttempts.length, 0, `local assets should be allowed under strict offline: ${JSON.stringify(result.externalAttempts)}`);
  assert.ok(result.findings.every((finding) => finding.url && finding.url.startsWith('http://127.0.0.1:')));
});

test('CLI --dir: scans a directory and emits multi-page JSON', async (t) => {
  t.timeout = 120000;

  const root = makeSite();
  const { code, stdout, stderr } = await runCli([
    '--dir', root,
    '--json',
    '--fail-on', 'none',
    '--strict-offline',
  ]);

  assert.equal(code, 0, stderr);
  const report = JSON.parse(stdout);
  assert.equal(report.directory, root);
  assert.equal(report.andiVersion, '29.2.2');
  assert.deepEqual(report.files, ['index.html', path.join('nested', 'page.htm')]);
  assert.equal(report.urls.length, 2);
  assert.ok((report.counts.danger || 0) >= 2);
});

test('CLI positional directory: andi-scan <dir> is treated as --dir', async (t) => {
  t.timeout = 120000;

  const root = makeSite();
  const { code, stdout, stderr } = await runCli([
    root,
    '--json',
    '--fail-on', 'none',
    '--strict-offline',
  ]);

  assert.equal(code, 0, stderr);
  const report = JSON.parse(stdout);
  assert.equal(report.directory, root);
  assert.equal(report.urls.length, 2);
});

test('CLI --dir: exits 2 when no html files are found', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'andi-dir-empty-'));
  const { code, stderr } = await runCli(['--dir', root]);

  assert.equal(code, 2);
  assert.match(stderr, /No \.html or \.htm files found/);
});
