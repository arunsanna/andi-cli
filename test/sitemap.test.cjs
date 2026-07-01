'use strict';
/**
 * test/sitemap.test.cjs — Validation V9: sitemap / multi-URL scanning.
 *
 * Tests:
 *   1. parseSitemap() extracts both <loc> URLs from sitemap.xml
 *   2. readUrlsFile() trims, skips blanks, and skips # comments
 *   3. scanUrls([pageA, pageB]) returns findings from BOTH pages, each
 *      tagged with the correct .url, and worst = worst across both pages
 *   4. scanUrls() with one bad URL records error, rest succeed, exit 2 logic
 *   5. CLI --urls <file> runs multi-URL and exits with worst across pages
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(REPO, 'test', 'fixtures', 'sitemap');
const SITEMAP_XML = path.join(FIXTURES_DIR, 'sitemap.xml');
const PAGE_A_URL = 'file://' + path.join(FIXTURES_DIR, 'page-a.html');
const PAGE_B_URL = 'file://' + path.join(FIXTURES_DIR, 'page-b.html');
const CLI = path.resolve(REPO, 'src', 'cli.cjs');

const { parseSitemap, readUrlsFile, scanUrls } = require('../src/sitemap.cjs');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function runCli(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { timeout: opts.timeout ?? 120000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

function startCountingServer() {
  return new Promise((resolve, reject) => {
    let hits = 0;
    const server = http.createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Strict offline URL list target</title></head>
<body><main><h1>Strict offline URL list target</h1><button></button></main></body>
</html>`);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        hits: () => hits,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Test 1: parseSitemap extracts both <loc> entries
// ---------------------------------------------------------------------------
test('parseSitemap: extracts both loc URLs from sitemap.xml', () => {
  const xml = fs.readFileSync(SITEMAP_XML, 'utf8');
  const urls = parseSitemap(xml);

  assert.ok(Array.isArray(urls), 'parseSitemap must return an array');
  assert.equal(urls.length, 2, `expected 2 URLs, got ${urls.length}: ${JSON.stringify(urls)}`);
  assert.ok(
    urls.some((u) => u.includes('page-a.html')),
    `page-a.html not found in: ${JSON.stringify(urls)}`
  );
  assert.ok(
    urls.some((u) => u.includes('page-b.html')),
    `page-b.html not found in: ${JSON.stringify(urls)}`
  );
});

// ---------------------------------------------------------------------------
// Test 2: readUrlsFile trims, skips blanks, skips # comments
// ---------------------------------------------------------------------------
test('readUrlsFile: trims, skips blank lines and # comments', () => {
  const text = [
    '  https://example.com/page1  ',
    '',
    '# This is a comment',
    'https://example.com/page2',
    '   ',
    '  # another comment  ',
    'https://example.com/page3',
  ].join('\n');

  const urls = readUrlsFile(text);

  assert.ok(Array.isArray(urls), 'readUrlsFile must return an array');
  assert.equal(urls.length, 3, `expected 3 URLs, got ${urls.length}: ${JSON.stringify(urls)}`);
  assert.equal(urls[0], 'https://example.com/page1', 'first URL must be trimmed');
  assert.equal(urls[1], 'https://example.com/page2', 'second URL must be correct');
  assert.equal(urls[2], 'https://example.com/page3', 'third URL must be correct');
});

// ---------------------------------------------------------------------------
// Test 3: scanUrls scans both pages, tags findings with .url, worst = worst
// ---------------------------------------------------------------------------
test('scanUrls: findings from both pages tagged with url, worst across all', async (t) => {
  t.timeout = 120000; // two full scans

  const result = await scanUrls([PAGE_A_URL, PAGE_B_URL], { concurrency: 1 });

  // Must have a urls array listing both pages
  assert.ok(Array.isArray(result.urls), 'result.urls must be an array');
  assert.equal(result.urls.length, 2, 'result.urls must list both pages');

  // Must have findings
  assert.ok(Array.isArray(result.findings), 'result.findings must be an array');
  assert.ok(result.findings.length > 0, 'must have at least one finding across both pages');

  // Every finding must have a .url property matching one of the scanned pages
  for (const f of result.findings) {
    assert.ok(
      typeof f.url === 'string' && f.url.length > 0,
      `finding missing .url: ${JSON.stringify(f)}`
    );
    assert.ok(
      f.url === PAGE_A_URL || f.url === PAGE_B_URL,
      `finding.url "${f.url}" must be one of the scanned pages`
    );
  }

  // Must have findings from BOTH pages (each page has planted danger violations)
  const urlsInFindings = new Set(result.findings.map((f) => f.url));
  assert.ok(
    urlsInFindings.has(PAGE_A_URL),
    `no findings tagged from page-a — set: ${JSON.stringify([...urlsInFindings])}`
  );
  assert.ok(
    urlsInFindings.has(PAGE_B_URL),
    `no findings tagged from page-b — set: ${JSON.stringify([...urlsInFindings])}`
  );

  // worst must be 'danger' (both pages have planted danger violations)
  assert.equal(result.worst, 'danger', `worst must be "danger", got "${result.worst}"`);

  // counts must be present
  assert.ok(result.counts && typeof result.counts === 'object', 'result.counts must be present');
  assert.ok((result.counts.danger ?? 0) > 0, 'counts.danger must be > 0');
});

// ---------------------------------------------------------------------------
// Test 4: scanUrls with one bad URL records error, doesn't abort, run is error
// ---------------------------------------------------------------------------
test('scanUrls: scan error on bad URL is recorded; other URLs still scanned', async (t) => {
  t.timeout = 120000;

  const BAD_URL = 'file:///nonexistent-andi-sitemap-test-page-404.html';
  const result = await scanUrls([BAD_URL, PAGE_A_URL], { concurrency: 1 });

  // Must not throw — result must exist
  assert.ok(result, 'scanUrls must return a result even when one URL fails');

  // errors array must record the bad URL
  assert.ok(Array.isArray(result.errors), 'result.errors must be an array');
  assert.ok(
    result.errors.length > 0,
    `expected at least one scan error, got: ${JSON.stringify(result.errors)}`
  );
  const badError = result.errors.find((e) => e.url === BAD_URL);
  assert.ok(badError, `error for ${BAD_URL} not found in errors: ${JSON.stringify(result.errors)}`);
  assert.ok(typeof badError.error === 'string', 'error entry must have a string .error message');

  // Good URL still scanned — findings from PAGE_A_URL must be present
  assert.ok(Array.isArray(result.findings), 'result.findings must be an array');
  assert.ok(result.findings.length > 0, 'must have findings from the successful page');
  const goodFindings = result.findings.filter((f) => f.url === PAGE_A_URL);
  assert.ok(goodFindings.length > 0, `findings from ${PAGE_A_URL} must be present`);

  // hasErrors flag must be set
  assert.equal(result.hasErrors, true, 'result.hasErrors must be true when any URL fails');
});

// ---------------------------------------------------------------------------
// Test 5: CLI --urls <file> → exit = worst across pages (both pages have danger)
// ---------------------------------------------------------------------------
test('CLI --urls: exits with worst across all pages', async (t) => {
  t.timeout = 150000;

  // Write a temp urls file pointing at both fixture pages
  const urlsFile = path.join(os.tmpdir(), 'andi-sitemap-test-urls.txt');
  fs.writeFileSync(urlsFile, [PAGE_A_URL, PAGE_B_URL, '# comment line', ''].join('\n'));

  const { code } = await runCli(['--urls', urlsFile, '--fail-on', 'danger']);
  // Both pages have danger violations → should exit 1
  assert.equal(code, 1, `--urls with danger fixtures should exit 1, got ${code}`);
});

// ---------------------------------------------------------------------------
// Test 6: --strict-offline enforced in multi-URL mode
// ---------------------------------------------------------------------------
test('scanUrls: externalAttempts aggregated across pages with source page tag', async (t) => {
  t.timeout = 150000;

  // Build a fixture that references a real external URL so vendor routes
  // record it in externalAttempts — same technique as single-URL strict-offline test.
  const strictFile = path.join(os.tmpdir(), 'andi-sitemap-strict-offline-page.html');
  fs.writeFileSync(strictFile, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Strict offline multi-URL test</title>
  <!-- Reference an external resource that vendor routes will block and record -->
  <link rel="stylesheet" href="https://example.com/some-multi-external.css">
</head>
<body>
  <main>
    <h1>Strict offline multi test</h1>
    <button>OK</button>
    <a href="/page">Link</a>
  </main>
</body>
</html>`);
  const strictUrl = 'file://' + strictFile;

  // Scan [PAGE_A_URL (clean), strictUrl (has external ref)] via scanUrls.
  const result = await scanUrls([PAGE_A_URL, strictUrl], { concurrency: 1 });

  // externalAttempts must be present on the result
  assert.ok(Array.isArray(result.externalAttempts), 'result.externalAttempts must be an array');

  // The strict-offline page must have contributed at least one external attempt
  assert.ok(
    result.externalAttempts.length > 0,
    `expected at least one externalAttempt; got: ${JSON.stringify(result.externalAttempts)}`
  );

  // Each entry must have {page, attempt} shape with the source page URL
  for (const entry of result.externalAttempts) {
    assert.ok(typeof entry.page === 'string' && entry.page.length > 0, `entry.page must be a string: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.attempt === 'string' && entry.attempt.length > 0, `entry.attempt must be a string: ${JSON.stringify(entry)}`);
  }

  // The offending page must be tagged correctly
  const offending = result.externalAttempts.find((e) => e.page === strictUrl);
  assert.ok(
    offending,
    `expected an externalAttempt tagged with source page ${strictUrl}; got: ${JSON.stringify(result.externalAttempts)}`
  );
});

test('CLI --urls: --strict-offline exits 2 when a page references external asset', async (t) => {
  t.timeout = 150000;

  const strictFile = path.join(os.tmpdir(), 'andi-sitemap-strict-offline-cli-page.html');
  fs.writeFileSync(strictFile, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CLI strict offline multi test</title>
  <link rel="stylesheet" href="https://example.com/some-cli-external.css">
</head>
<body>
  <main>
    <h1>CLI strict offline</h1>
    <button>OK</button>
    <a href="/page">Link</a>
  </main>
</body>
</html>`);
  const strictUrl = 'file://' + strictFile;

  const urlsFile = path.join(os.tmpdir(), 'andi-sitemap-strict-offline-cli-urls.txt');
  fs.writeFileSync(urlsFile, [PAGE_A_URL, strictUrl].join('\n'));

  const { code, stderr } = await runCli(['--urls', urlsFile, '--fail-on', 'none', '--strict-offline']);
  // --strict-offline must exit 2 when any page has external attempts
  assert.equal(code, 2, `--urls --strict-offline should exit 2 when external attempts detected, got ${code}`);
  // stderr must mention the offending external URL and source page
  assert.ok(
    /example\.com|external|strict.offline/i.test(stderr + ''),
    `--strict-offline should print offending URL info to stderr; got: ${stderr}`
  );
});

test('CLI --urls: --strict-offline blocks live target before request leaves', async (t) => {
  t.timeout = 120000;

  const target = await startCountingServer();
  const urlsFile = path.join(os.tmpdir(), 'andi-sitemap-strict-offline-live-target.txt');
  fs.writeFileSync(urlsFile, target.url);

  try {
    const { code, stderr } = await runCli(['--urls', urlsFile, '--fail-on', 'none', '--strict-offline']);

    assert.equal(code, 2, '--urls --strict-offline should fail when a listed URL would require network');
    assert.equal(target.hits(), 0, '--urls --strict-offline must abort the target request before it reaches the server');
    assert.ok(
      /blocked|ERR_BLOCKED_BY_CLIENT|scan error|strict.offline/i.test(stderr + ''),
      `stderr should describe the blocked scan; got: ${stderr}`
    );
  } finally {
    await target.close();
  }
});
