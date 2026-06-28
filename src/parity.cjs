'use strict';
/**
 * Browser-vs-CLI ANDI parity harness.
 *
 * The CLI side uses the production scanModule() path: local vendored ANDI
 * assets, fresh browser context per module, DOM extraction.
 *
 * The browser side intentionally has two sources:
 *   - live: inject https://www.ssa.gov/accessibility/andi/andi.js like the
 *     bookmarklet. This is the closest browser parity check, but it requires
 *     network and should use http(s) targets, not file:// fixtures.
 *   - local: inject the same vendored assets through installVendorRoutes().
 *     This is deterministic and suitable for tests/CI.
 */

const { installVendorRoutes } = require('./vendor-route.cjs');
const {
  injectAndi,
  navigateTargetPage,
  waitTargetPageReady,
  waitAndiReady,
  waitActiveModule,
  waitModuleStable,
  resolvePlaywright,
} = require('./andi-helpers.cjs');
const { extractFindings } = require('./extract.cjs');
const { MODULES, scanModule } = require('./modules.cjs');
const fs = require('fs');
const path = require('path');

const LIVE_ANDI_URL = 'https://www.ssa.gov/accessibility/andi/andi.js';
const SEVERITIES = ['danger', 'warning', 'caution', 'info'];
const MODULE_FILES = {
  f: 'fandi.js',
  g: 'gandi.js',
  l: 'landi.js',
  t: 'tandi.js',
  s: 'sandi.js',
  c: 'candi.js',
  h: 'handi.js',
  i: 'iandi.js',
};

function resolveModuleKeys(modulesOpt) {
  if (!modulesOpt || modulesOpt === 'f') return ['f'];
  if (modulesOpt === 'all') return Object.keys(MODULES);
  if (Array.isArray(modulesOpt)) return modulesOpt;
  return String(modulesOpt)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function severityCounts(findings) {
  const counts = { danger: 0, warning: 0, caution: 0, info: 0 };
  for (const f of findings || []) {
    if (counts[f.severity] !== undefined) counts[f.severity]++;
  }
  return counts;
}

function readVendoredModuleVersion(moduleKey) {
  const file = MODULE_FILES[moduleKey];
  if (!file) return null;
  const filePath = path.resolve(__dirname, '..', 'andi', file);
  try {
    const src = fs.readFileSync(filePath, 'utf8');
    const match = src.match(/var\s+[A-Za-z0-9_]*VersionNumber\s*=\s*"([^"]+)"/);
    return match ? `${moduleKey}ANDI: ${match[1]}` : null;
  } catch (_) {
    return null;
  }
}

function worstSeverity(findings) {
  const counts = severityCounts(findings);
  return SEVERITIES.find((level) => counts[level] > 0) || null;
}

function normalizeElement(element) {
  if (!element) return null;
  return {
    tag: element.tag || null,
    selector: element.selector || null,
    andiIndex: element.andiIndex ?? null,
    html: normalizeText(element.html),
  };
}

function normalizeFinding(finding) {
  return {
    engine: finding.engine || 'andi',
    module: finding.module || null,
    severity: finding.severity || 'info',
    rule: finding.rule || 'andi-alert',
    message: normalizeText(finding.message),
    element: normalizeElement(finding.element),
  };
}

function elementSignature(element) {
  if (!element) return 'page';
  return [
    element.tag || '',
    element.selector || '',
    element.andiIndex ?? '',
    element.html || '',
  ].join('::');
}

function findingSignature(finding) {
  return [
    finding.module || '',
    finding.severity || '',
    finding.rule || '',
    finding.message || '',
    elementSignature(finding.element),
  ].join('\u0000');
}

function sortedNormalizedFindings(findings) {
  return (findings || [])
    .map(normalizeFinding)
    .sort((a, b) => findingSignature(a).localeCompare(findingSignature(b)));
}

function makeMultiset(findings) {
  const map = new Map();
  for (const finding of findings) {
    const key = findingSignature(finding);
    const entry = map.get(key) || { finding, count: 0 };
    entry.count++;
    map.set(key, entry);
  }
  return map;
}

function diffMultiset(left, right) {
  const rightMap = makeMultiset(right);
  const missing = [];
  for (const [key, entry] of makeMultiset(left)) {
    const rightCount = rightMap.get(key)?.count || 0;
    const delta = entry.count - rightCount;
    for (let i = 0; i < delta; i++) missing.push(entry.finding);
  }
  return missing;
}

function countsEqual(a, b) {
  return SEVERITIES.every((level) => (a?.[level] || 0) === (b?.[level] || 0));
}

async function collectCliModule(browser, url, moduleKey, opts = {}) {
  const result = await scanModule(browser, url, moduleKey, {
    timeoutMs: opts.timeoutMs,
    strictOffline: opts.strictOffline,
  });
  const findings = sortedNormalizedFindings(result.findings);
  return {
    source: 'cli',
    moduleKey,
    module: MODULES[moduleKey] || moduleKey,
    andiVersion: result.andiVersion || null,
    moduleVersion: readVendoredModuleVersion(moduleKey),
    findings,
    counts: severityCounts(findings),
    worst: worstSeverity(findings),
    externalAttempts: result.externalAttempts || [],
  };
}

async function collectBrowserModule(browser, url, moduleKey, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const browserSource = opts.browserSource || 'live';
  const network = { andiResponses: [], failures: [] };
  const ctx = await browser.newContext({ bypassCSP: true });

  try {
    const page = await ctx.newPage();
    let externalAttempts = [];

    page.on('response', (response) => {
      const responseUrl = response.url();
      if (responseUrl.includes('/accessibility/andi/') || /\/jquery[.-]/i.test(responseUrl)) {
        network.andiResponses.push({ url: responseUrl, status: response.status() });
      }
    });
    page.on('requestfailed', (request) => {
      network.failures.push({
        url: request.url(),
        errorText: request.failure()?.errorText || null,
      });
    });

    if (browserSource === 'local') {
      const routed = await installVendorRoutes(page, { strictOffline: opts.strictOffline });
      externalAttempts = routed.externalAttempts;
    } else if (browserSource !== 'live') {
      throw new Error(`Unknown browserSource "${browserSource}"`);
    }

    await navigateTargetPage(page, url, timeoutMs);
    await waitTargetPageReady(page, timeoutMs);

    if (browserSource === 'local') {
      await injectAndi(page);
    } else {
      await page.addScriptTag({ url: opts.liveAndiUrl || LIVE_ANDI_URL });
    }

    await waitAndiReady(page, timeoutMs);
    await waitActiveModule(page, 'f', timeoutMs);
    await page.evaluate(() => { window.__andiStable = null; });
    await waitModuleStable(page, Math.min(timeoutMs, 12000));
    if (moduleKey !== 'f') {
      await page.evaluate((m) => {
        window.__andiStable = null;
        window.AndiModule.launchModule(m);
      }, moduleKey);
      await waitActiveModule(page, moduleKey, timeoutMs);
      await page.evaluate(() => { window.__andiStable = null; });
      await waitModuleStable(page, Math.min(timeoutMs, 12000));
    }

    const rawFindings = await extractFindings(page, moduleKey);
    const findings = sortedNormalizedFindings(rawFindings);
    const andiVersion = await page.evaluate(() => window.andiVersionNumber || null);
    const moduleVersion = await page.evaluate(
      () => document.getElementById('ANDI508-module-name')?.getAttribute('data-andi508-moduleversion') || null
    );
    const andiAlertTotal = await page.evaluate(
      () => window.testPageData?.numberOfAccessibilityAlertsFound ?? null
    );

    return {
      source: `browser-${browserSource}`,
      moduleKey,
      module: MODULES[moduleKey] || moduleKey,
      andiVersion,
      moduleVersion,
      andiAlertTotal,
      findings,
      counts: severityCounts(findings),
      worst: worstSeverity(findings),
      externalAttempts,
      network,
    };
  } finally {
    await ctx.close();
  }
}

function compareCollections(cli, browserResult) {
  const missingInBrowser = diffMultiset(cli.findings, browserResult.findings);
  const extraInBrowser = diffMultiset(browserResult.findings, cli.findings);
  const countMatch = countsEqual(cli.counts, browserResult.counts);
  const versionMatch = !!cli.andiVersion &&
    !!browserResult.andiVersion &&
    cli.andiVersion === browserResult.andiVersion;
  const moduleVersionMatch = !!cli.moduleVersion &&
    !!browserResult.moduleVersion &&
    cli.moduleVersion === browserResult.moduleVersion;
  const findingMatch = missingInBrowser.length === 0 && extraInBrowser.length === 0;

  let verdict = 'different';
  if (versionMatch && moduleVersionMatch && countMatch && findingMatch) verdict = 'exact';
  else if (!versionMatch || !moduleVersionMatch) verdict = 'version-drift';

  return {
    moduleKey: cli.moduleKey,
    module: cli.module,
    verdict,
    versionMatch,
    moduleVersionMatch,
    countMatch,
    findingMatch,
    cliCounts: cli.counts,
    browserCounts: browserResult.counts,
    cliTotal: cli.findings.length,
    browserTotal: browserResult.findings.length,
    missingInBrowser,
    extraInBrowser,
  };
}

function errorCollection(source, moduleKey, error) {
  return {
    source,
    moduleKey,
    module: MODULES[moduleKey] || moduleKey,
    andiVersion: null,
    moduleVersion: null,
    findings: [],
    counts: severityCounts([]),
    worst: null,
    error: error && error.message ? error.message : String(error),
  };
}

async function runParityComparison(url, opts = {}) {
  const { chromium } = resolvePlaywright();
  const modules = resolveModuleKeys(opts.modules ?? opts.module ?? 'f');
  const browserSource = opts.browserSource || 'live';
  const browser = await chromium.launch({ headless: opts.headless !== false });
  const startedAt = new Date().toISOString();
  const results = [];

  try {
    for (const moduleKey of modules) {
      let cli;
      let browserResult;

      try {
        cli = await collectCliModule(browser, url, moduleKey, opts);
      } catch (error) {
        cli = errorCollection('cli', moduleKey, error);
      }

      try {
        browserResult = await collectBrowserModule(browser, url, moduleKey, {
          ...opts,
          browserSource,
        });
      } catch (error) {
        browserResult = errorCollection(`browser-${browserSource}`, moduleKey, error);
      }

      const comparison = cli.error || browserResult.error
        ? {
            moduleKey,
            module: MODULES[moduleKey] || moduleKey,
            verdict: 'error',
            versionMatch: false,
            moduleVersionMatch: false,
            countMatch: false,
            findingMatch: false,
            cliCounts: cli.counts,
            browserCounts: browserResult.counts,
            cliTotal: cli.findings.length,
            browserTotal: browserResult.findings.length,
            missingInBrowser: [],
            extraInBrowser: [],
            error: cli.error || browserResult.error,
          }
        : compareCollections(cli, browserResult);

      results.push({ moduleKey, module: MODULES[moduleKey] || moduleKey, cli, browser: browserResult, comparison });
    }
  } finally {
    await browser.close();
  }

  const summary = summarizeResults(results);
  return {
    tool: 'andi-parity',
    url,
    browserSource,
    startedAt,
    modules,
    summary,
    results,
    warnings: buildWarnings(url, browserSource),
  };
}

function summarizeResults(results) {
  const summary = {
    totalModules: results.length,
    exact: 0,
    different: 0,
    versionDrift: 0,
    errors: 0,
    ready: false,
  };
  for (const r of results) {
    if (r.comparison.verdict === 'exact') summary.exact++;
    else if (r.comparison.verdict === 'version-drift') summary.versionDrift++;
    else if (r.comparison.verdict === 'error') summary.errors++;
    else summary.different++;
  }
  summary.ready = summary.totalModules > 0 &&
    summary.exact === summary.totalModules &&
    summary.errors === 0;
  return summary;
}

function buildWarnings(url, browserSource) {
  const warnings = [];
  if (browserSource === 'live' && /^file:/i.test(url)) {
    warnings.push('browser-live parity against file:// pages can under-report; serve the file over http:// instead.');
  }
  return warnings;
}

function formatSummary(report) {
  const lines = [];
  lines.push(`ANDI parity report: ${report.url}`);
  lines.push(`browser source: ${report.browserSource}`);
  lines.push(`modules: ${report.modules.join(', ')}`);
  if (report.warnings.length) {
    for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  }
  lines.push('');
  lines.push('| module | verdict | CLI total | Browser total | versions | counts |');
  lines.push('| --- | --- | ---: | ---: | --- | --- |');
  for (const result of report.results) {
    const c = result.comparison;
    const versionText = c.versionMatch && c.moduleVersionMatch ? 'match' : 'diff';
    lines.push(`| ${result.module} | ${c.verdict} | ${c.cliTotal} | ${c.browserTotal} | ${versionText} | ${c.countMatch ? 'match' : 'diff'} |`);
  }
  lines.push('');
  lines.push(`summary: ${report.summary.exact}/${report.summary.totalModules} exact, ${report.summary.different} different, ${report.summary.versionDrift} version drift, ${report.summary.errors} errors`);
  return lines.join('\n');
}

module.exports = {
  LIVE_ANDI_URL,
  resolveModuleKeys,
  normalizeFinding,
  findingSignature,
  compareCollections,
  collectCliModule,
  collectBrowserModule,
  runParityComparison,
  summarizeResults,
  formatSummary,
};
