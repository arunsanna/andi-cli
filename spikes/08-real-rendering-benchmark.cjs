#!/usr/bin/env node
'use strict';

/**
 * Real rendering benchmark harness.
 *
 * This is intentionally a spike: it exercises the public CLI subprocess surface
 * and compares it with a browser-side ANDI oracle for the same rendered page.
 *
 * Claims measured:
 *   1. CLI URL scans match a direct Playwright page with ANDI injected.
 *   2. file:// rendering can differ from localhost rendering.
 *   3. --dir matches explicit localhost URL-list scanning for the same folder.
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { aggregate } = require('../src/aggregate.cjs');
const {
  discoverHtmlFiles,
  startStaticServer,
} = require('../src/directory.cjs');
const {
  collectBrowserModule,
  normalizeFinding,
  findingSignature,
  resolveModuleKeys,
} = require('../src/parity.cjs');
const { resolvePlaywright } = require('../src/andi-helpers.cjs');

const CLI = path.resolve(__dirname, '..', 'src', 'cli.cjs');
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_PAGES = 25;
const SEVERITIES = ['danger', 'warning', 'caution', 'info'];

const HELP = `real-rendering-benchmark

USAGE:
  node spikes/08-real-rendering-benchmark.cjs [options]

OPTIONS:
  --site <name=path>          Add a rendered static site directory.
  --match-dir <path>          Alias for --site match=<path>.
  --include-generated         Include generated fixture sites.
  --out-dir <path>            Output directory. Default: results/real-rendering-benchmark/<timestamp>
  --browser-source <source>   local|live|both|none. Default: local.
  --module <key|all|a,b>      ANDI modules. Default: all.
  --timeout <ms>              Per-step timeout. Default: 30000.
  --max-pages <n>             Max HTML pages per site. Default: 25.
  --strict-offline            Pass --strict-offline to CLI URL and directory scans.
  -h, --help                  Show this help.

NOTES:
  - CLI paths are real subprocess calls to node src/cli.cjs.
  - Browser source local uses vendored ANDI in a Playwright page.
  - Browser source live injects https://www.ssa.gov/accessibility/andi/andi.js.
  - file:// live browser oracle is skipped; use localhost for live bookmarklet parity.
`;

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

function parseArgs(argv) {
  const opts = {
    sites: [],
    browserSource: 'local',
    modules: 'all',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxPages: DEFAULT_MAX_PAGES,
    includeGenerated: false,
    strictOffline: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--site':
        opts.sites.push(parseSiteSpec(next()));
        break;
      case '--match-dir':
        opts.sites.push({ name: 'match', root: next(), kind: 'match' });
        break;
      case '--include-generated':
        opts.includeGenerated = true;
        break;
      case '--out-dir':
        opts.outDir = next();
        break;
      case '--browser-source':
        opts.browserSource = next();
        break;
      case '--module':
        opts.modules = next();
        break;
      case '--timeout':
        opts.timeoutMs = Number(next()) || DEFAULT_TIMEOUT_MS;
        break;
      case '--max-pages':
        opts.maxPages = Number(next()) || DEFAULT_MAX_PAGES;
        break;
      case '--strict-offline':
        opts.strictOffline = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!['local', 'live', 'both', 'none'].includes(opts.browserSource)) {
    throw new Error('--browser-source must be local, live, both, or none');
  }

  if (opts.sites.length === 0) opts.includeGenerated = true;
  return opts;
}

function parseSiteSpec(spec) {
  if (!spec) throw new Error('--site requires name=path or path');
  const eq = spec.indexOf('=');
  if (eq === -1) {
    return { name: path.basename(path.resolve(spec)), root: spec, kind: 'site' };
  }
  const name = spec.slice(0, eq).trim();
  const root = spec.slice(eq + 1).trim();
  if (!name || !root) throw new Error(`Invalid --site value: ${spec}`);
  return { name, root, kind: 'site' };
}

function emptyCounts() {
  return { danger: 0, warning: 0, caution: 0, info: 0 };
}

function cloneCounts(counts = {}) {
  return {
    danger: counts.danger || 0,
    warning: counts.warning || 0,
    caution: counts.caution || 0,
    info: counts.info || 0,
  };
}

function totalCounts(counts = {}) {
  return SEVERITIES.reduce((sum, severity) => sum + (counts[severity] || 0), 0);
}

function subtractCounts(left = {}, right = {}) {
  const out = emptyCounts();
  for (const severity of SEVERITIES) {
    out[severity] = (left[severity] || 0) - (right[severity] || 0);
  }
  return out;
}

function countsEqual(left = {}, right = {}) {
  return SEVERITIES.every((severity) => (left[severity] || 0) === (right[severity] || 0));
}

function addCounts(left = {}, right = {}) {
  const out = cloneCounts(left);
  for (const severity of SEVERITIES) out[severity] += right[severity] || 0;
  return out;
}

function normalizedFindings(findings = []) {
  return findings
    .map(normalizeFinding)
    .sort((a, b) => findingSignature(a).localeCompare(findingSignature(b)));
}

function multiset(findings = []) {
  const out = new Map();
  for (const finding of normalizedFindings(findings)) {
    const key = findingSignature(finding);
    const entry = out.get(key) || { finding, count: 0 };
    entry.count++;
    out.set(key, entry);
  }
  return out;
}

function diffFindings(left = [], right = []) {
  const leftMap = multiset(left);
  const rightMap = multiset(right);
  const missing = [];
  const extra = [];
  const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);

  for (const key of keys) {
    const leftCount = leftMap.get(key)?.count || 0;
    const rightCount = rightMap.get(key)?.count || 0;
    if (leftCount > rightCount) {
      missing.push({
        count: leftCount - rightCount,
        finding: leftMap.get(key).finding,
      });
    }
    if (rightCount > leftCount) {
      extra.push({
        count: rightCount - leftCount,
        finding: rightMap.get(key).finding,
      });
    }
  }

  return {
    match: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

function safeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'site';
}

function runCliJson(args, opts = {}) {
  const outputPath = opts.outputPath;
  if (!outputPath) throw new Error('runCliJson requires outputPath');
  ensureDir(path.dirname(outputPath));

  const fullArgs = [
    CLI,
    ...args,
    '--module', opts.modules,
    '--timeout', String(opts.timeoutMs),
    '--fail-on', 'none',
    '--quiet',
    '--out', outputPath,
  ];
  if (opts.strictOffline) fullArgs.push('--strict-offline');

  const started = Date.now();
  const child = childProcess.spawn(process.execPath, fullArgs, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  const command = [process.execPath, ...fullArgs].map(shellToken).join(' ');

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      resolve({
        command,
        exitCode: null,
        signal: null,
        elapsedMs: Date.now() - started,
        stdout,
        stderr,
        outputPath,
        error: error.message || String(error),
        report: readJsonIfExists(outputPath),
      });
    });
    child.on('close', (code, signal) => {
      const base = {
        command,
        exitCode: code,
        signal: signal || null,
        elapsedMs: Date.now() - started,
        stdout,
        stderr,
        outputPath,
      };

      if (code !== 0) {
        resolve({ ...base, error: `CLI exited ${code}`, report: readJsonIfExists(outputPath) });
        return;
      }

      resolve({ ...base, error: null, report: readJsonIfExists(outputPath) });
    });
  });
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function shellToken(value) {
  const s = String(value);
  return /^[A-Za-z0-9_./:=@-]+$/.test(s) ? s : JSON.stringify(s);
}

async function collectBrowserOracle(browser, url, opts) {
  if (opts.source === 'none') {
    return {
      source: 'none',
      skipped: true,
      counts: emptyCounts(),
      findings: [],
      modules: [],
    };
  }

  const modules = [];
  for (const moduleKey of opts.moduleKeys) {
    try {
      const moduleResult = await collectBrowserModule(browser, url, moduleKey, {
        timeoutMs: opts.timeoutMs,
        browserSource: opts.source,
      });
      modules.push({ moduleKey, error: null, result: moduleResult });
    } catch (error) {
      modules.push({
        moduleKey,
        error: error.message || String(error),
        result: {
          source: `browser-${opts.source}`,
          moduleKey,
          findings: [],
          counts: emptyCounts(),
        },
      });
    }
  }

  const aggregateResult = aggregate(modules.map((entry) => entry.result.findings || []));
  return {
    source: opts.source,
    skipped: false,
    counts: aggregateResult.counts,
    findings: aggregateResult.findings,
    worst: aggregateResult.worst,
    modules,
    hasErrors: modules.some((entry) => entry.error),
    errors: modules.filter((entry) => entry.error).map((entry) => ({
      moduleKey: entry.moduleKey,
      error: entry.error,
    })),
  };
}

function compareReports(leftReport, rightReport) {
  const leftCounts = cloneCounts(leftReport?.counts);
  const rightCounts = cloneCounts(rightReport?.counts);
  const diff = diffFindings(leftReport?.findings || [], rightReport?.findings || []);
  return {
    countsMatch: countsEqual(leftCounts, rightCounts),
    findingFingerprintMatch: diff.match,
    totalDelta: totalCounts(leftCounts) - totalCounts(rightCounts),
    countDelta: subtractCounts(leftCounts, rightCounts),
    missingFromLeft: diff.missing.slice(0, 20),
    extraInLeft: diff.extra.slice(0, 20),
  };
}

function browserSourcesForMode(browserSource, mode) {
  if (browserSource === 'none') return [];
  if (mode === 'file') return ['local'];
  if (browserSource === 'both') return ['local', 'live'];
  return [browserSource];
}

async function scanUrlMode(browser, siteOutDir, siteName, page, mode, url, opts) {
  const slug = `${safeName(page.file)}-${mode}`;
  const cli = await runCliJson(['--url', url], {
    modules: opts.modules,
    timeoutMs: opts.timeoutMs,
    strictOffline: opts.strictOffline,
    outputPath: path.join(siteOutDir, `${slug}.cli.json`),
  });

  const browserOracles = [];
  for (const source of browserSourcesForMode(opts.browserSource, mode)) {
    const oracle = await collectBrowserOracle(browser, url, {
      source,
      moduleKeys: opts.moduleKeys,
      timeoutMs: opts.timeoutMs,
    });
    browserOracles.push({
      source,
      oracle,
      comparison: cli.report ? compareReports(cli.report, oracle) : null,
    });
  }

  return {
    site: siteName,
    mode,
    file: page.file,
    url,
    cli,
    browserOracles,
  };
}

async function scanSite(browser, site, opts) {
  const root = path.resolve(site.root);
  const siteOutDir = path.join(opts.outDir, 'sites', safeName(site.name));
  const htmlFiles = discoverHtmlFiles(root).slice(0, opts.maxPages);
  const pages = htmlFiles.map((file) => ({
    file: path.relative(root, file),
    path: file,
    fileUrl: pathToFileURL(file).href,
  }));

  if (pages.length === 0) {
    throw new Error(`${site.name}: no .html or .htm files found under ${root}`);
  }

  const report = {
    name: site.name,
    kind: site.kind || 'site',
    root,
    pageCount: pages.length,
    truncated: discoverHtmlFiles(root).length > pages.length,
    pages: pages.map((page) => page.file),
    fileScans: [],
    localhostScans: [],
    urlsCli: null,
    dirCli: null,
    comparisons: {},
  };

  for (const page of pages) {
    report.fileScans.push(
      await scanUrlMode(browser, siteOutDir, site.name, page, 'file', page.fileUrl, opts)
    );
  }

  const server = await startStaticServer(root);
  try {
    for (const page of pages) {
      page.localhostUrl = server.urlForFile(page.path);
      report.localhostScans.push(
        await scanUrlMode(browser, siteOutDir, site.name, page, 'localhost', page.localhostUrl, opts)
      );
    }

    const urlsFile = path.join(siteOutDir, 'localhost.urls.txt');
    writeFile(urlsFile, pages.map((page) => page.localhostUrl).join('\n') + '\n');
    report.urlsCli = await runCliJson(['--urls', urlsFile], {
      modules: opts.modules,
      timeoutMs: opts.timeoutMs,
      strictOffline: opts.strictOffline,
      outputPath: path.join(siteOutDir, 'localhost.urls.cli.json'),
    });
  } finally {
    await server.close();
  }

  report.dirCli = await runCliJson(['--dir', root], {
    modules: opts.modules,
    timeoutMs: opts.timeoutMs,
    strictOffline: opts.strictOffline,
    outputPath: path.join(siteOutDir, 'dir.cli.json'),
  });

  report.comparisons.dirVsUrls = report.dirCli.report && report.urlsCli.report
    ? compareReports(report.dirCli.report, report.urlsCli.report)
    : null;
  report.comparisons.fileVsLocalhost = compareScanLists(report.fileScans, report.localhostScans);

  return report;
}

function compareScanLists(fileScans, localhostScans) {
  const byFile = new Map(localhostScans.map((scan) => [scan.file, scan]));
  const pages = [];
  for (const fileScan of fileScans) {
    const localScan = byFile.get(fileScan.file);
    pages.push({
      file: fileScan.file,
      comparison: fileScan.cli.report && localScan?.cli.report
        ? compareReports(fileScan.cli.report, localScan.cli.report)
        : null,
      fileError: fileScan.cli.error,
      localhostError: localScan?.cli.error || null,
    });
  }
  return pages;
}

function summarizeSite(site) {
  const fileLocal = summarizeMode(site.fileScans, 'local');
  const localhostLocal = summarizeMode(site.localhostScans, 'local');
  const localhostLive = summarizeMode(site.localhostScans, 'live');
  const fileVsLocalhostDrifts = (site.comparisons.fileVsLocalhost || [])
    .filter((entry) => entry.comparison && !entry.comparison.findingFingerprintMatch)
    .length;

  return {
    name: site.name,
    pages: site.pageCount,
    fileCliErrors: site.fileScans.filter((scan) => scan.cli.error).length,
    localhostCliErrors: site.localhostScans.filter((scan) => scan.cli.error).length,
    fileVsBrowserLocal: fileLocal,
    localhostVsBrowserLocal: localhostLocal,
    localhostVsBrowserLive: localhostLive,
    fileVsLocalhostDriftPages: fileVsLocalhostDrifts,
    dirVsUrlsCountsMatch: site.comparisons.dirVsUrls?.countsMatch || false,
    dirVsUrlsFingerprintsMatch: site.comparisons.dirVsUrls?.findingFingerprintMatch || false,
    dirCliError: site.dirCli?.error || null,
    urlsCliError: site.urlsCli?.error || null,
  };
}

function summarizeMode(scans, source) {
  let total = 0;
  let compared = 0;
  let exact = 0;
  let countOnly = 0;
  let errors = 0;

  for (const scan of scans) {
    const oracle = scan.browserOracles.find((entry) => entry.source === source);
    if (!oracle) continue;
    total++;
    if (scan.cli.error || oracle.oracle.hasErrors || !oracle.comparison) {
      errors++;
      continue;
    }
    compared++;
    if (oracle.comparison.countsMatch && oracle.comparison.findingFingerprintMatch) exact++;
    else if (oracle.comparison.countsMatch) countOnly++;
  }

  return { total, compared, exact, countOnly, errors };
}

function makeGeneratedSites(baseDir) {
  const relativeRoot = path.join(baseDir, 'generated-relative-site');
  const rootRelativeRoot = path.join(baseDir, 'generated-root-relative-site');
  createGeneratedSite(relativeRoot, { rootRelative: false });
  createGeneratedSite(rootRelativeRoot, { rootRelative: true });
  return [
    { name: 'generated-relative-site', root: relativeRoot, kind: 'generated' },
    { name: 'generated-root-relative-site', root: rootRelativeRoot, kind: 'generated' },
  ];
}

function createGeneratedSite(root, opts = {}) {
  ensureDir(root);
  const prefix = opts.rootRelative ? '/' : './';
  const nestedPrefix = opts.rootRelative ? '/' : '../';

  writeFile(path.join(root, 'assets', 'styles.css'), `
body { font-family: system-ui, sans-serif; margin: 2rem; }
.low-contrast { color: #aaa; background: #fff; }
table { border-collapse: collapse; margin-top: 1rem; }
td { border: 1px solid #ccc; padding: 0.25rem; }
`.trimStart());

  writeFile(path.join(root, 'assets', 'app.js'), `
document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('main');
  const dynamicButton = document.createElement('button');
  dynamicButton.className = 'dynamic-empty-button';
  main.appendChild(dynamicButton);

  const dynamicImage = document.createElement('img');
  dynamicImage.src = '${prefix}assets/sample.svg';
  dynamicImage.className = 'dynamic-image';
  main.appendChild(dynamicImage);
});
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
  <title>Generated ${opts.rootRelative ? 'root-relative' : 'relative'} benchmark</title>
  <link rel="stylesheet" href="${prefix}assets/styles.css">
  <script src="${prefix}assets/app.js" defer></script>
</head>
<body>
  <main>
    <h1>Generated benchmark</h1>
    <p class="low-contrast">This paragraph is intentionally low contrast.</p>
    <button></button>
    <a href="${prefix}nested/page.htm"></a>
    <img src="${prefix}assets/sample.svg">
  </main>
</body>
</html>
`);

  writeFile(path.join(root, 'nested', 'page.htm'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Generated nested benchmark page</title>
  <link rel="stylesheet" href="${nestedPrefix}assets/styles.css">
</head>
<body>
  <main>
    <h1>Nested page</h1>
    <a href="${nestedPrefix}index.html"></a>
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

function renderCounts(counts) {
  const c = cloneCounts(counts);
  return `D ${c.danger}, W ${c.warning}, C ${c.caution}, I ${c.info}`;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Real Rendering Benchmark');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Modules: ${report.modules}`);
  lines.push(`Browser source: ${report.browserSource}`);
  lines.push(`Timeout: ${report.timeoutMs} ms`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Site | Pages | file CLI errors | localhost CLI errors | file vs local browser | localhost vs local browser | localhost vs live browser | --dir vs --urls | file-vs-localhost drift pages |');
  lines.push('|---|---:|---:|---:|---|---|---|---|---:|');

  for (const site of report.summary) {
    lines.push([
      `| ${site.name}`,
      site.pages,
      site.fileCliErrors,
      site.localhostCliErrors,
      formatMode(site.fileVsBrowserLocal),
      formatMode(site.localhostVsBrowserLocal),
      formatMode(site.localhostVsBrowserLive),
      site.dirVsUrlsCountsMatch && site.dirVsUrlsFingerprintsMatch ? 'exact' : 'drift',
      `${site.fileVsLocalhostDriftPages} |`,
    ].join(' | '));
  }

  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('- file and localhost rows compare real CLI subprocess output with a browser page oracle for the same rendered URL.');
  lines.push('- --dir vs --urls compares two real CLI subprocess paths over the same static folder.');
  lines.push('- file-vs-localhost drift pages are expected when a site uses root-relative paths, base tags, or scripts that resolve differently outside a web server.');
  lines.push('- live browser oracle is network-dependent and skipped for file:// URLs.');
  lines.push('');
  lines.push('## Directory Counts');
  lines.push('');
  lines.push('| Site | --dir counts | --urls counts | total delta |');
  lines.push('|---|---|---|---:|');
  for (const site of report.sites) {
    const dirCounts = site.dirCli.report?.counts || emptyCounts();
    const urlsCounts = site.urlsCli.report?.counts || emptyCounts();
    const delta = totalCounts(dirCounts) - totalCounts(urlsCounts);
    lines.push(`| ${site.name} | ${renderCounts(dirCounts)} | ${renderCounts(urlsCounts)} | ${delta} |`);
  }
  return lines.join('\n') + '\n';
}

function formatMode(mode) {
  if (!mode || mode.total === 0) return 'not run';
  if (mode.errors > 0) return `${mode.errors}/${mode.total} errors`;
  return `${mode.exact}/${mode.compared} exact`;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`real-rendering-benchmark: ${error.message}\n\n${HELP}`);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  opts.outDir = path.resolve(opts.outDir || path.join('results', 'real-rendering-benchmark', timestampForPath()));
  ensureDir(opts.outDir);

  const sites = opts.sites.slice();
  if (opts.includeGenerated) {
    sites.unshift(...makeGeneratedSites(path.join(opts.outDir, 'generated-sites')));
  }
  if (sites.length === 0) {
    throw new Error('No sites to benchmark');
  }

  opts.moduleKeys = resolveModuleKeys(opts.modules);
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ headless: true });
  const started = Date.now();

  try {
    const siteReports = [];
    for (const site of sites) {
      process.stderr.write(`benchmarking ${site.name}: ${path.resolve(site.root)}\n`);
      siteReports.push(await scanSite(browser, site, opts));
    }

    const report = {
      tool: 'real-rendering-benchmark',
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      modules: opts.modules,
      moduleKeys: opts.moduleKeys,
      browserSource: opts.browserSource,
      timeoutMs: opts.timeoutMs,
      maxPages: opts.maxPages,
      strictOffline: opts.strictOffline,
      sites: siteReports,
      summary: siteReports.map(summarizeSite),
    };

    const jsonPath = path.join(opts.outDir, 'real-rendering-benchmark.json');
    const markdownPath = path.join(opts.outDir, 'real-rendering-benchmark.md');
    writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n');
    writeFile(markdownPath, renderMarkdown(report));

    process.stdout.write(JSON.stringify({
      outDir: opts.outDir,
      jsonPath,
      markdownPath,
      elapsedMs: report.elapsedMs,
      summary: report.summary,
    }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`real-rendering-benchmark: ${error.stack || error.message || String(error)}\n`);
  process.exit(2);
});
