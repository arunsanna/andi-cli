#!/usr/bin/env node
'use strict';

/**
 * Prototype benchmark: compare direct localhost URL scans against --dir scans.
 *
 * This answers the "does rendering a local folder produce the same result as
 * scanning the rendered page URL?" question without needing a deployed site.
 */

const fs = require('fs');
const path = require('path');
const {
  discoverHtmlFiles,
  scanDirectory,
  startStaticServer,
} = require('../src/directory.cjs');
const { scanUrls } = require('../src/sitemap.cjs');

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(file, body) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, body);
}

function makePrototypeSite(root) {
  ensureDir(root);

  writeFile(path.join(root, 'assets', 'app.js'), `
document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('main');

  const dynamicButton = document.createElement('button');
  dynamicButton.className = 'dynamic-empty-button';
  main.appendChild(dynamicButton);

  const dynamicImage = document.createElement('img');
  dynamicImage.src = '/assets/sample.svg';
  dynamicImage.className = 'dynamic-image';
  main.appendChild(dynamicImage);
});
`.trimStart());

  writeFile(path.join(root, 'assets', 'styles.css'), `
body { font-family: system-ui, sans-serif; margin: 2rem; }
.low-contrast { color: #aaa; background: #fff; }
.visually-small { font-size: 12px; }
table { border-collapse: collapse; margin-top: 1rem; }
td { border: 1px solid #ccc; padding: 0.25rem; }
`.trimStart());

  writeFile(path.join(root, 'assets', 'sample.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" role="img">
  <rect width="80" height="40" fill="#ddd"/>
  <circle cx="20" cy="20" r="12" fill="#777"/>
</svg>
`.trimStart());

  writeFile(path.join(root, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ANDI directory benchmark index</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script src="/assets/app.js" defer></script>
</head>
<body>
  <main>
    <h1>ANDI directory benchmark</h1>
    <p class="low-contrast">This paragraph is intentionally low contrast.</p>
    <button></button>
    <a href="/nested/page.htm"></a>
    <img src="/assets/sample.svg">
  </main>
</body>
</html>
`);

  writeFile(path.join(root, 'nested', 'page.htm'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Nested ANDI directory benchmark page</title>
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <main>
    <h1>Nested page</h1>
    <a href="/"></a>
    <button aria-label=""></button>
    <table>
      <tr><td>Product</td><td>Price</td></tr>
      <tr><td>Widget</td><td>$10</td></tr>
    </table>
  </main>
</body>
</html>
`);
}

function sumCounts(counts = {}) {
  return ['danger', 'warning', 'caution', 'info']
    .reduce((sum, key) => sum + (counts[key] || 0), 0);
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function findingFingerprint(finding) {
  const element = finding.element || {};
  return [
    finding.moduleKey || finding.module || '',
    finding.severity || '',
    normalizeWhitespace(finding.message),
    element.tag || '',
    normalizeWhitespace(element.text),
    element.id || '',
    element.role || '',
    normalizeWhitespace(element.name),
    finding.wcag || '',
  ].join('\u001f');
}

function countMap(findings = []) {
  const map = new Map();
  for (const finding of findings) {
    const key = findingFingerprint(finding);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function diffMaps(left, right) {
  const missing = [];
  const extra = [];
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    const leftCount = left.get(key) || 0;
    const rightCount = right.get(key) || 0;
    if (leftCount > rightCount) missing.push({ fingerprint: key, count: leftCount - rightCount });
    if (rightCount > leftCount) extra.push({ fingerprint: key, count: rightCount - leftCount });
  }
  return { missing, extra };
}

function compareResults(urlScan, dirScan) {
  const urlCounts = urlScan.counts || {};
  const dirCounts = dirScan.counts || {};
  const countDelta = {};
  for (const key of ['danger', 'warning', 'caution', 'info']) {
    countDelta[key] = (dirCounts[key] || 0) - (urlCounts[key] || 0);
  }

  const urlMap = countMap(urlScan.findings);
  const dirMap = countMap(dirScan.findings);
  const { missing, extra } = diffMaps(urlMap, dirMap);

  return {
    countsMatch: Object.values(countDelta).every((value) => value === 0),
    totalDelta: sumCounts(dirCounts) - sumCounts(urlCounts),
    countDelta,
    fingerprintMatch: missing.length === 0 && extra.length === 0,
    missingFromDir: missing,
    extraInDir: extra,
  };
}

function renderMarkdown(report) {
  const c = report.comparison;
  const lines = [];
  lines.push('# Directory vs URL ANDI Prototype Benchmark');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Site root: \`${report.siteRoot}\``);
  lines.push(`Modules: \`${report.modules}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | URL scan | Directory scan | Delta |');
  lines.push('|---|---:|---:|---:|');
  for (const key of ['danger', 'warning', 'caution', 'info']) {
    lines.push(`| ${key} | ${report.urlScan.counts[key] || 0} | ${report.dirScan.counts[key] || 0} | ${c.countDelta[key]} |`);
  }
  lines.push(`| total | ${report.urlScan.total} | ${report.dirScan.total} | ${c.totalDelta} |`);
  lines.push('');
  lines.push(`Counts match: **${c.countsMatch ? 'yes' : 'no'}**`);
  lines.push(`Finding fingerprints match: **${c.fingerprintMatch ? 'yes' : 'no'}**`);
  lines.push(`URL scan elapsed: ${report.urlScan.elapsedMs} ms`);
  lines.push(`Directory scan elapsed: ${report.dirScan.elapsedMs} ms`);
  lines.push('');
  lines.push('## Pages');
  lines.push('');
  for (const page of report.pages) {
    lines.push(`- \`${page.file}\` -> \`${page.path}\``);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const modules = process.argv.includes('--module')
    ? process.argv[process.argv.indexOf('--module') + 1]
    : 'all';
  const timeoutArg = process.argv.includes('--timeout')
    ? Number(process.argv[process.argv.indexOf('--timeout') + 1])
    : 45000;
  const timeoutMs = Number.isFinite(timeoutArg) && timeoutArg > 0 ? timeoutArg : 45000;

  const outDir = path.resolve('results', 'dir-vs-url-benchmark', timestampForPath());
  const siteRoot = path.join(outDir, 'site');
  makePrototypeSite(siteRoot);

  const htmlFiles = discoverHtmlFiles(siteRoot);
  let urlScan;
  let directOrigin = null;
  const directServer = await startStaticServer(siteRoot);
  try {
    directOrigin = directServer.origin;
    const urls = htmlFiles.map((file) => directServer.urlForFile(file));
    const started = Date.now();
    urlScan = await scanUrls(urls, {
      modules,
      timeoutMs,
      concurrency: 1,
      strictOffline: true,
      allowedOrigins: [directServer.origin],
    });
    urlScan.elapsedMs = Date.now() - started;
  } finally {
    await directServer.close();
  }

  const dirStarted = Date.now();
  const dirScan = await scanDirectory(siteRoot, {
    modules,
    timeoutMs,
    concurrency: 1,
    strictOffline: true,
  });
  dirScan.elapsedMs = Date.now() - dirStarted;

  const report = {
    tool: 'andi-dir-vs-url-prototype',
    generatedAt: new Date().toISOString(),
    modules,
    timeoutMs,
    siteRoot,
    directOrigin,
    directoryOrigin: dirScan.staticOrigin,
    pages: htmlFiles.map((file) => ({
      file: path.relative(siteRoot, file),
      path: new URL(directServer.urlForFile(file)).pathname,
    })),
    urlScan: {
      urls: urlScan.urls,
      counts: urlScan.counts,
      total: sumCounts(urlScan.counts),
      worst: urlScan.worst,
      hasErrors: urlScan.hasErrors,
      errors: urlScan.errors,
      externalAttempts: urlScan.externalAttempts,
      andiVersion: urlScan.andiVersion,
      elapsedMs: urlScan.elapsedMs,
      findings: urlScan.findings,
    },
    dirScan: {
      directory: dirScan.directory,
      files: dirScan.files,
      urls: dirScan.urls,
      counts: dirScan.counts,
      total: sumCounts(dirScan.counts),
      worst: dirScan.worst,
      hasErrors: dirScan.hasErrors,
      errors: dirScan.errors,
      externalAttempts: dirScan.externalAttempts,
      andiVersion: dirScan.andiVersion,
      elapsedMs: dirScan.elapsedMs,
      findings: dirScan.findings,
    },
  };
  report.comparison = compareResults(report.urlScan, report.dirScan);

  const jsonPath = path.join(outDir, 'dir-vs-url-benchmark.json');
  const markdownPath = path.join(outDir, 'dir-vs-url-benchmark.md');
  writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n');
  writeFile(markdownPath, renderMarkdown(report));

  process.stdout.write(JSON.stringify({
    outDir,
    json: jsonPath,
    markdown: markdownPath,
    modules,
    urlTotal: report.urlScan.total,
    dirTotal: report.dirScan.total,
    comparison: report.comparison,
    urlElapsedMs: report.urlScan.elapsedMs,
    dirElapsedMs: report.dirScan.elapsedMs,
  }, null, 2) + '\n');

  process.exit(report.comparison.countsMatch && report.comparison.fingerprintMatch ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`dir-vs-url benchmark failed: ${error.stack || error.message || String(error)}\n`);
  process.exit(2);
});
