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
