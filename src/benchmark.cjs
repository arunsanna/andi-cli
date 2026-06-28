'use strict';

const fs = require('fs');
const path = require('path');
const { collectCliModule, resolveModuleKeys } = require('./parity.cjs');
const { resolvePlaywright } = require('./andi-helpers.cjs');

const SEVERITIES = ['danger', 'warning', 'caution', 'info'];
const DEFAULT_MODULES = ['f', 'g', 'l', 't', 's', 'c', 'h', 'i'];
const MODULE_NAMES = {
  f: 'focusable',
  g: 'graphics',
  l: 'links',
  t: 'tables',
  s: 'structures',
  c: 'contrast',
  h: 'hidden',
  i: 'iframes',
};

function emptyCounts() {
  return { danger: 0, warning: 0, caution: 0, info: 0 };
}

function cloneCounts(counts) {
  return {
    danger: counts?.danger || 0,
    warning: counts?.warning || 0,
    caution: counts?.caution || 0,
    info: counts?.info || 0,
  };
}

function addCounts(a, b) {
  const out = cloneCounts(a);
  for (const severity of SEVERITIES) {
    out[severity] += b?.[severity] || 0;
  }
  return out;
}

function subtractCounts(a, b) {
  const out = emptyCounts();
  for (const severity of SEVERITIES) {
    out[severity] = (a?.[severity] || 0) - (b?.[severity] || 0);
  }
  return out;
}

function totalCounts(counts) {
  return SEVERITIES.reduce((sum, severity) => sum + (counts?.[severity] || 0), 0);
}

function countsEqual(a, b) {
  return SEVERITIES.every((severity) => (a?.[severity] || 0) === (b?.[severity] || 0));
}

function normalizeUrlLabel(url) {
  try {
    const parsed = new URL(url);
    const pathLabel = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.hostname}${pathLabel}`;
  } catch (_) {
    return url;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function readBrowserFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function browserModule(page, moduleKey) {
  return (page.modules || []).find((entry) => entry.moduleKey === moduleKey) || {
    moduleKey,
    module: MODULE_NAMES[moduleKey] || moduleKey,
    andiVersion: null,
    moduleVersion: null,
    total: 0,
    counts: emptyCounts(),
    sample: [],
  };
}

function errorCliModule(moduleKey, error, elapsedMs) {
  return {
    source: 'cli',
    moduleKey,
    module: MODULE_NAMES[moduleKey] || moduleKey,
    andiVersion: null,
    moduleVersion: null,
    findings: [],
    counts: emptyCounts(),
    worst: null,
    error: error && error.message ? error.message : String(error),
    elapsedMs,
  };
}

function hasSampleMatch(sample, cliFindings) {
  return (cliFindings || []).some((finding) => {
    if (finding.severity !== sample.severity) return false;
    if (finding.message !== sample.message) return false;
    if (sample.element?.tag && finding.element?.tag !== sample.element.tag) return false;
    return true;
  });
}

function compareModule(browserResult, cliResult) {
  const browserCounts = cloneCounts(browserResult.counts);
  const cliCounts = cloneCounts(cliResult.counts);
  const sample = browserResult.sample || [];
  const matchedSamples = sample.filter((entry) => hasSampleMatch(entry, cliResult.findings || []));
  const countMatch = countsEqual(browserCounts, cliCounts);
  const versionMatch = !!browserResult.andiVersion &&
    !!cliResult.andiVersion &&
    browserResult.andiVersion === cliResult.andiVersion;
  const moduleVersionMatch = !!browserResult.moduleVersion &&
    !!cliResult.moduleVersion &&
    browserResult.moduleVersion === cliResult.moduleVersion;
  const error = browserResult.error || cliResult.error || null;

  let verdict = 'count-drift';
  if (error) verdict = 'error';
  else if (countMatch && versionMatch && moduleVersionMatch) verdict = 'exact-counts';
  else if (countMatch) verdict = 'exact-counts-version-drift';

  return {
    moduleKey: browserResult.moduleKey,
    module: browserResult.module || cliResult.module || MODULE_NAMES[browserResult.moduleKey] || browserResult.moduleKey,
    verdict,
    countMatch,
    versionMatch,
    moduleVersionMatch,
    browserCounts,
    cliCounts,
    delta: subtractCounts(cliCounts, browserCounts),
    browserTotal: totalCounts(browserCounts),
    cliTotal: totalCounts(cliCounts),
    totalDelta: totalCounts(cliCounts) - totalCounts(browserCounts),
    browserSampleCount: sample.length,
    browserSampleMatchCount: matchedSamples.length,
    browserSampleUnmatched: sample
      .filter((entry) => !hasSampleMatch(entry, cliResult.findings || []))
      .slice(0, 5)
      .map((entry) => ({
        severity: entry.severity,
        message: entry.message,
        elementTag: entry.element?.tag || null,
        elementText: entry.element?.text || null,
      })),
    error,
  };
}

function summarizeModuleTotals(pages, moduleKeys) {
  const totals = {};
  for (const moduleKey of moduleKeys) {
    totals[moduleKey] = {
      moduleKey,
      module: MODULE_NAMES[moduleKey] || moduleKey,
      browserCounts: emptyCounts(),
      cliCounts: emptyCounts(),
      delta: emptyCounts(),
      browserTotal: 0,
      cliTotal: 0,
      totalDelta: 0,
      exactPages: 0,
      driftPages: 0,
      errorPages: 0,
    };
  }

  for (const page of pages) {
    for (const mod of page.modules) {
      const entry = totals[mod.moduleKey];
      entry.browserCounts = addCounts(entry.browserCounts, mod.browserCounts);
      entry.cliCounts = addCounts(entry.cliCounts, mod.cliCounts);
      if (mod.verdict === 'error') entry.errorPages++;
      else if (mod.countMatch) entry.exactPages++;
      else entry.driftPages++;
    }
  }

  for (const entry of Object.values(totals)) {
    entry.delta = subtractCounts(entry.cliCounts, entry.browserCounts);
    entry.browserTotal = totalCounts(entry.browserCounts);
    entry.cliTotal = totalCounts(entry.cliCounts);
    entry.totalDelta = entry.cliTotal - entry.browserTotal;
  }
  return totals;
}

function buildBenchmarkReport(browserFixture, cliPageResults, opts = {}) {
  const moduleKeys = opts.moduleKeys || DEFAULT_MODULES;
  const pages = browserFixture.pages.map((browserPage, index) => {
    const cliPage = cliPageResults.find((entry) => entry.url === browserPage.url) || { modules: [] };
    const modules = moduleKeys.map((moduleKey) => {
      const browserResult = browserModule(browserPage, moduleKey);
      const cliResult = cliPage.modules.find((entry) => entry.moduleKey === moduleKey) ||
        errorCliModule(moduleKey, new Error('CLI module result missing'), 0);
      return compareModule(browserResult, cliResult);
    });
    const browserCounts = cloneCounts(browserPage.totals);
    const cliCounts = modules.reduce((acc, mod) => addCounts(acc, mod.cliCounts), emptyCounts());
    const errorCount = modules.filter((mod) => mod.verdict === 'error').length;
    const driftCount = modules.filter((mod) => !mod.countMatch && mod.verdict !== 'error').length;
    const sampleCount = modules.reduce((sum, mod) => sum + mod.browserSampleCount, 0);
    const sampleMatchCount = modules.reduce((sum, mod) => sum + mod.browserSampleMatchCount, 0);
    let verdict = 'count-drift';
    if (errorCount > 0) verdict = 'error';
    else if (driftCount === 0) verdict = 'exact-counts';

    return {
      index: index + 1,
      url: browserPage.url,
      title: browserPage.title || null,
      label: normalizeUrlLabel(browserPage.url),
      browserStatus: browserPage.status,
      cliStatus: cliPage.status || (errorCount ? 'error' : 'ok'),
      verdict,
      browserCounts,
      cliCounts,
      delta: subtractCounts(cliCounts, browserCounts),
      browserTotal: totalCounts(browserCounts),
      cliTotal: totalCounts(cliCounts),
      totalDelta: totalCounts(cliCounts) - totalCounts(browserCounts),
      errorCount,
      driftCount,
      sampleCount,
      sampleMatchCount,
      elapsedMs: cliPage.elapsedMs || null,
      modules,
    };
  });

  const browserCounts = pages.reduce((acc, page) => addCounts(acc, page.browserCounts), emptyCounts());
  const cliCounts = pages.reduce((acc, page) => addCounts(acc, page.cliCounts), emptyCounts());
  const moduleTotals = summarizeModuleTotals(pages, moduleKeys);
  const exactPages = pages.filter((page) => page.verdict === 'exact-counts').length;
  const errorPages = pages.filter((page) => page.verdict === 'error').length;
  const driftPages = pages.length - exactPages - errorPages;

  return {
    tool: 'andi-browser-cli-benchmark',
    generatedAt: opts.generatedAt || new Date().toISOString(),
    browserFixture: {
      sourcePath: opts.browserFixturePath || null,
      collectedAt: browserFixture.collectedAt || null,
      browserSource: browserFixture.browserSource || null,
      pageCount: browserFixture.pageCount || browserFixture.pages.length,
    },
    cli: {
      source: 'andi-cli',
      timeoutMs: opts.timeoutMs || null,
      moduleKeys,
    },
    summary: {
      pageCount: pages.length,
      moduleCount: pages.length * moduleKeys.length,
      exactPages,
      driftPages,
      errorPages,
      exactModules: pages.reduce((sum, page) => sum + page.modules.filter((mod) => mod.countMatch && mod.verdict !== 'error').length, 0),
      driftModules: pages.reduce((sum, page) => sum + page.modules.filter((mod) => !mod.countMatch && mod.verdict !== 'error').length, 0),
      errorModules: pages.reduce((sum, page) => sum + page.modules.filter((mod) => mod.verdict === 'error').length, 0),
      browserCounts,
      cliCounts,
      delta: subtractCounts(cliCounts, browserCounts),
      browserTotal: totalCounts(browserCounts),
      cliTotal: totalCounts(cliCounts),
      totalDelta: totalCounts(cliCounts) - totalCounts(browserCounts),
      browserSampleCount: pages.reduce((sum, page) => sum + page.sampleCount, 0),
      browserSampleMatchCount: pages.reduce((sum, page) => sum + page.sampleMatchCount, 0),
    },
    moduleTotals,
    pages,
  };
}

async function collectCliForFixture(browserFixture, opts = {}) {
  const { chromium } = resolvePlaywright();
  const moduleKeys = opts.moduleKeys || DEFAULT_MODULES;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const browser = await chromium.launch({ headless: opts.headless !== false });
  const pages = [];

  try {
    for (const [pageIndex, browserPage] of browserFixture.pages.entries()) {
      const pageStarted = Date.now();
      const pageResult = {
        index: pageIndex + 1,
        url: browserPage.url,
        status: 'ok',
        modules: [],
        elapsedMs: null,
      };

      for (const moduleKey of moduleKeys) {
        const moduleStarted = Date.now();
        try {
          const moduleResult = await collectCliModule(browser, browserPage.url, moduleKey, { timeoutMs });
          pageResult.modules.push({
            ...moduleResult,
            elapsedMs: Date.now() - moduleStarted,
          });
        } catch (error) {
          pageResult.status = 'error';
          pageResult.modules.push(errorCliModule(moduleKey, error, Date.now() - moduleStarted));
        }
      }

      pageResult.elapsedMs = Date.now() - pageStarted;
      pages.push(pageResult);
      if (opts.onPage) opts.onPage(pageResult, pageIndex + 1, browserFixture.pages.length);
    }
  } finally {
    await browser.close();
  }

  return pages;
}

async function runBenchmark(opts = {}) {
  const browserFixturePath = path.resolve(opts.browserFixturePath);
  const browserFixture = readBrowserFixture(browserFixturePath);
  const moduleKeys = resolveModuleKeys(opts.modules || DEFAULT_MODULES).filter((key) => DEFAULT_MODULES.includes(key));
  const cliPages = await collectCliForFixture(browserFixture, {
    moduleKeys,
    timeoutMs: opts.timeoutMs,
    headless: opts.headless,
    onPage: opts.onPage,
  });
  return buildBenchmarkReport(browserFixture, cliPages, {
    browserFixturePath,
    moduleKeys,
    timeoutMs: opts.timeoutMs,
  });
}

function tableRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function countsText(counts) {
  return `D ${counts.danger}, W ${counts.warning}, C ${counts.caution}, I ${counts.info}`;
}

function renderMarkdown(report) {
  const lines = [];
  const topDeltas = [...report.pages]
    .sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
    .slice(0, 10);

  lines.push('# Browser vs CLI ANDI Benchmark');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Browser proof: ${report.browserFixture.browserSource} collected ${report.browserFixture.collectedAt}`);
  lines.push(`CLI timeout: ${report.cli.timeoutMs} ms`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Browser | CLI | Delta |');
  lines.push('|---|---:|---:|---:|');
  for (const severity of SEVERITIES) {
    lines.push(`| ${severity} | ${report.summary.browserCounts[severity]} | ${report.summary.cliCounts[severity]} | ${report.summary.delta[severity]} |`);
  }
  lines.push(`| total | ${report.summary.browserTotal} | ${report.summary.cliTotal} | ${report.summary.totalDelta} |`);
  lines.push('');
  lines.push(`Pages: ${report.summary.exactPages}/${report.summary.pageCount} exact count matches, ${report.summary.driftPages} with count drift, ${report.summary.errorPages} with CLI errors.`);
  lines.push(`Modules: ${report.summary.exactModules}/${report.summary.moduleCount} exact count matches, ${report.summary.driftModules} with count drift, ${report.summary.errorModules} with errors.`);
  lines.push(`Browser sample messages found by CLI: ${report.summary.browserSampleMatchCount}/${report.summary.browserSampleCount}.`);
  lines.push('');
  lines.push('## Largest Page Deltas');
  lines.push('');
  lines.push('| # | Page | Browser total | CLI total | Delta | Browser counts | CLI counts | Verdict |');
  lines.push('|---:|---|---:|---:|---:|---|---|---|');
  for (const page of topDeltas) {
    lines.push(tableRow([
      page.index,
      page.url,
      page.browserTotal,
      page.cliTotal,
      page.totalDelta,
      countsText(page.browserCounts),
      countsText(page.cliCounts),
      page.verdict,
    ]));
  }
  lines.push('');
  lines.push('## Module Totals');
  lines.push('');
  lines.push('| Module | Browser total | CLI total | Delta | Exact pages | Drift pages | Error pages |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const moduleKey of report.cli.moduleKeys) {
    const mod = report.moduleTotals[moduleKey];
    lines.push(tableRow([
      `${moduleKey} ${mod.module}`,
      mod.browserTotal,
      mod.cliTotal,
      mod.totalDelta,
      mod.exactPages,
      mod.driftPages,
      mod.errorPages,
    ]));
  }
  lines.push('');
  lines.push('## Per-Page Results');
  lines.push('');
  lines.push('| # | Page | Browser | CLI | Delta | Exact modules | Drift modules | Error modules |');
  lines.push('|---:|---|---:|---:|---:|---:|---:|---:|');
  for (const page of report.pages) {
    lines.push(tableRow([
      page.index,
      page.url,
      page.browserTotal,
      page.cliTotal,
      page.totalDelta,
      page.modules.filter((mod) => mod.countMatch && mod.verdict !== 'error').length,
      page.modules.filter((mod) => !mod.countMatch && mod.verdict !== 'error').length,
      page.errorCount,
    ]));
  }

  const errors = [];
  for (const page of report.pages) {
    for (const mod of page.modules) {
      if (mod.error) errors.push({ page, mod });
    }
  }
  if (errors.length) {
    lines.push('');
    lines.push('## CLI Errors');
    lines.push('');
    for (const { page, mod } of errors) {
      lines.push(`- ${page.url} ${mod.module}: ${mod.error}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderPageTotalsSvg(report) {
  const rowHeight = 32;
  const labelWidth = 250;
  const chartWidth = 520;
  const rightPad = 80;
  const width = labelWidth + chartWidth + rightPad;
  const height = 70 + report.pages.length * rowHeight;
  const maxTotal = Math.max(1, ...report.pages.flatMap((page) => [page.browserTotal, page.cliTotal]));
  const scale = chartWidth / maxTotal;
  const rows = report.pages.map((page, i) => {
    const y = 50 + i * rowHeight;
    const browserWidth = Math.max(1, page.browserTotal * scale);
    const cliWidth = Math.max(1, page.cliTotal * scale);
    return `
      <text x="8" y="${y + 14}" font-size="11">${escapeXml(`${page.index}. ${page.label}`)}</text>
      <rect x="${labelWidth}" y="${y}" width="${browserWidth}" height="10" fill="#2563eb"/>
      <rect x="${labelWidth}" y="${y + 13}" width="${cliWidth}" height="10" fill="#f97316"/>
      <text x="${labelWidth + chartWidth + 8}" y="${y + 9}" font-size="10">${page.browserTotal}</text>
      <text x="${labelWidth + chartWidth + 8}" y="${y + 22}" font-size="10">${page.cliTotal}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Browser vs CLI finding totals by page</title>
  <desc id="desc">Grouped horizontal bars compare browser ANDI totals and CLI totals for each benchmark page.</desc>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="8" y="22" font-size="18" font-weight="700">Finding totals by page</text>
  <rect x="${labelWidth}" y="30" width="12" height="12" fill="#2563eb"/><text x="${labelWidth + 18}" y="40" font-size="12">Browser</text>
  <rect x="${labelWidth + 88}" y="30" width="12" height="12" fill="#f97316"/><text x="${labelWidth + 106}" y="40" font-size="12">CLI</text>
  ${rows}
</svg>
`;
}

function renderScatterSvg(report) {
  const width = 720;
  const height = 520;
  const pad = 58;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;
  const maxTotal = Math.max(1, ...report.pages.flatMap((page) => [page.browserTotal, page.cliTotal]));
  const scaleX = (value) => pad + (value / maxTotal) * plotW;
  const scaleY = (value) => height - pad - (value / maxTotal) * plotH;
  const points = report.pages.map((page) => `
    <circle cx="${scaleX(page.browserTotal)}" cy="${scaleY(page.cliTotal)}" r="5" fill="${page.totalDelta === 0 ? '#16a34a' : '#dc2626'}">
      <title>${escapeXml(`${page.index}. ${page.label}: browser ${page.browserTotal}, CLI ${page.cliTotal}, delta ${page.totalDelta}`)}</title>
    </circle>
    <text x="${scaleX(page.browserTotal) + 7}" y="${scaleY(page.cliTotal) + 4}" font-size="10">${page.index}</text>
  `).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Browser vs CLI parity scatter</title>
  <desc id="desc">Each point is one benchmark page. Points on the diagonal have equal browser and CLI totals.</desc>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${pad}" y="28" font-size="18" font-weight="700">Parity scatter</text>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${pad}" stroke="#94a3b8" stroke-dasharray="5 5"/>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#0f172a"/>
  <line x1="${pad}" y1="${height - pad}" x2="${pad}" y2="${pad}" stroke="#0f172a"/>
  <text x="${width / 2 - 60}" y="${height - 12}" font-size="12">Browser total</text>
  <text x="12" y="${height / 2}" font-size="12" transform="rotate(-90 12 ${height / 2})">CLI total</text>
  <text x="${pad - 8}" y="${height - pad + 18}" text-anchor="end" font-size="10">0</text>
  <text x="${width - pad}" y="${height - pad + 18}" text-anchor="middle" font-size="10">${maxTotal}</text>
  <text x="${pad - 10}" y="${pad + 4}" text-anchor="end" font-size="10">${maxTotal}</text>
  ${points}
</svg>
`;
}

function heatColor(delta) {
  if (delta === 0) return '#e2e8f0';
  const capped = Math.min(1, Math.abs(delta) / 100);
  if (delta > 0) return `rgba(249, 115, 22, ${0.25 + capped * 0.65})`;
  return `rgba(37, 99, 235, ${0.25 + capped * 0.65})`;
}

function renderModuleHeatmapSvg(report) {
  const cellW = 72;
  const cellH = 26;
  const labelWidth = 250;
  const top = 70;
  const width = labelWidth + report.cli.moduleKeys.length * cellW + 40;
  const height = top + report.pages.length * cellH + 45;
  const header = report.cli.moduleKeys.map((key, i) => `
    <text x="${labelWidth + i * cellW + cellW / 2}" y="55" font-size="11" text-anchor="middle">${key}</text>
  `).join('\n');
  const rows = report.pages.map((page, rowIndex) => {
    const y = top + rowIndex * cellH;
    const cells = report.cli.moduleKeys.map((key, colIndex) => {
      const mod = page.modules.find((entry) => entry.moduleKey === key);
      const x = labelWidth + colIndex * cellW;
      return `
        <rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" fill="${heatColor(mod.totalDelta)}"/>
        <text x="${x + cellW / 2}" y="${y + 16}" font-size="10" text-anchor="middle">${mod.totalDelta}</text>`;
    }).join('\n');
    return `
      <text x="8" y="${y + 16}" font-size="11">${escapeXml(`${page.index}. ${page.label}`)}</text>
      ${cells}`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Module delta heatmap</title>
  <desc id="desc">Cells show CLI total minus browser total for each page and ANDI module.</desc>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="8" y="24" font-size="18" font-weight="700">Module delta heatmap</text>
  <text x="8" y="42" font-size="11">Blue means CLI found fewer than browser. Orange means CLI found more.</text>
  ${header}
  ${rows}
</svg>
`;
}

function renderHtml(report, assetNames = {}) {
  const pageSvg = assetNames.pageTotalsSvg || 'page-totals.svg';
  const scatterSvg = assetNames.scatterSvg || 'parity-scatter.svg';
  const heatmapSvg = assetNames.heatmapSvg || 'module-delta-heatmap.svg';
  const rows = report.pages.map((page) => `
    <tr>
      <td>${page.index}</td>
      <td><a href="${escapeHtml(page.url)}">${escapeHtml(page.label)}</a></td>
      <td>${page.browserTotal}</td>
      <td>${page.cliTotal}</td>
      <td class="${page.totalDelta === 0 ? '' : 'delta'}">${page.totalDelta}</td>
      <td>${page.verdict}</td>
    </tr>`).join('\n');
  const moduleRows = report.cli.moduleKeys.map((key) => {
    const mod = report.moduleTotals[key];
    return `
      <tr>
        <td>${escapeHtml(`${key} ${mod.module}`)}</td>
        <td>${mod.browserTotal}</td>
        <td>${mod.cliTotal}</td>
        <td class="${mod.totalDelta === 0 ? '' : 'delta'}">${mod.totalDelta}</td>
        <td>${mod.exactPages}</td>
        <td>${mod.driftPages}</td>
        <td>${mod.errorPages}</td>
      </tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Browser vs CLI ANDI Benchmark</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; color: #111827; background: #f8fafc; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 20px 48px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 28px 0 12px; }
    .meta { color: #475569; margin: 0 0 18px; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
    .metric { background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 12px; }
    .metric strong { display: block; font-size: 24px; }
    .chart { background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 12px; margin: 12px 0; overflow-x: auto; }
    .chart img { display: block; max-width: none; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dbe3ef; }
    th, td { padding: 8px 9px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 13px; }
    th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
    th { background: #eef2f7; }
    .delta { font-weight: 700; color: #b91c1c; }
    a { color: #1d4ed8; text-decoration: none; }
    @media (max-width: 720px) {
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      main { padding: 20px 12px 36px; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Browser vs CLI ANDI Benchmark</h1>
    <p class="meta">Generated ${escapeHtml(report.generatedAt)} from browser proof ${escapeHtml(report.browserFixture.collectedAt)}.</p>
    <section class="summary" aria-label="Benchmark summary">
      <div class="metric"><span>Browser total</span><strong>${report.summary.browserTotal}</strong></div>
      <div class="metric"><span>CLI total</span><strong>${report.summary.cliTotal}</strong></div>
      <div class="metric"><span>Total delta</span><strong>${report.summary.totalDelta}</strong></div>
      <div class="metric"><span>Exact pages</span><strong>${report.summary.exactPages}/${report.summary.pageCount}</strong></div>
    </section>
    <h2>Finding Totals</h2>
    <div class="chart"><img src="${escapeHtml(pageSvg)}" alt="Browser and CLI finding totals by benchmark page"></div>
    <h2>Parity Scatter</h2>
    <div class="chart"><img src="${escapeHtml(scatterSvg)}" alt="Scatter plot of browser total against CLI total"></div>
    <h2>Module Delta Heatmap</h2>
    <div class="chart"><img src="${escapeHtml(heatmapSvg)}" alt="Heatmap of CLI minus browser total by page and module"></div>
    <h2>Module Totals</h2>
    <table>
      <thead><tr><th>Module</th><th>Browser</th><th>CLI</th><th>Delta</th><th>Exact pages</th><th>Drift pages</th><th>Error pages</th></tr></thead>
      <tbody>${moduleRows}</tbody>
    </table>
    <h2>Per-Page Totals</h2>
    <table>
      <thead><tr><th>#</th><th>Page</th><th>Browser</th><th>CLI</th><th>Delta</th><th>Verdict</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>
`;
}

function writeReportFiles(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    json: path.join(outDir, 'browser-vs-cli-benchmark.json'),
    markdown: path.join(outDir, 'browser-vs-cli-benchmark.md'),
    html: path.join(outDir, 'browser-vs-cli-benchmark.html'),
    pageTotalsSvg: path.join(outDir, 'page-totals.svg'),
    scatterSvg: path.join(outDir, 'parity-scatter.svg'),
    heatmapSvg: path.join(outDir, 'module-delta-heatmap.svg'),
  };
  fs.writeFileSync(files.json, JSON.stringify(report, null, 2));
  fs.writeFileSync(files.markdown, renderMarkdown(report));
  fs.writeFileSync(files.pageTotalsSvg, renderPageTotalsSvg(report));
  fs.writeFileSync(files.scatterSvg, renderScatterSvg(report));
  fs.writeFileSync(files.heatmapSvg, renderModuleHeatmapSvg(report));
  fs.writeFileSync(files.html, renderHtml(report, {
    pageTotalsSvg: path.basename(files.pageTotalsSvg),
    scatterSvg: path.basename(files.scatterSvg),
    heatmapSvg: path.basename(files.heatmapSvg),
  }));
  return files;
}

module.exports = {
  SEVERITIES,
  DEFAULT_MODULES,
  emptyCounts,
  addCounts,
  subtractCounts,
  totalCounts,
  countsEqual,
  buildBenchmarkReport,
  collectCliForFixture,
  runBenchmark,
  renderMarkdown,
  renderHtml,
  renderPageTotalsSvg,
  renderScatterSvg,
  renderModuleHeatmapSvg,
  writeReportFiles,
};
