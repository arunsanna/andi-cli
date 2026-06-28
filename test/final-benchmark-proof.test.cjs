'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BROWSER_PROOF_PATH = path.resolve(
  __dirname,
  'fixtures/browser-benchmark/fresh-live-browser-andi-20-pages.json'
);
const FINAL_BENCHMARK_PATH = path.resolve(
  __dirname,
  'fixtures/browser-benchmark/final-browser-vs-cli-benchmark.json'
);
const GRAPH_ASSET_DIR = path.resolve(__dirname, '..', 'docs/validation/browser-cli-benchmark');
const SEVERITIES = ['danger', 'warning', 'caution', 'info'];
const MODULE_KEYS = ['f', 'g', 'l', 't', 's', 'c', 'h', 'i'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function addCounts(a, b) {
  const out = { ...a };
  for (const severity of SEVERITIES) out[severity] += b?.[severity] || 0;
  return out;
}

function totalCounts(counts) {
  return SEVERITIES.reduce((sum, severity) => sum + (counts?.[severity] || 0), 0);
}

test('fresh browser proof has all 20 pages and all ANDI modules', () => {
  const report = readJson(BROWSER_PROOF_PATH);

  assert.equal(report.tool, 'browser-andi-batch');
  assert.equal(report.browserSource, 'live-ssa-bookmarklet-refreshed');
  assert.equal(report.pageCount, 20);
  assert.equal(report.pages.length, 20);
  assert.deepEqual(report.modules.map((entry) => entry.key), MODULE_KEYS);

  for (const page of report.pages) {
    assert.equal(page.status, 'ok', `${page.url} should have completed`);
    assert.equal(page.moduleErrorCount, 0, `${page.url} should have no module errors`);
    assert.deepEqual(page.modules.map((entry) => entry.moduleKey), MODULE_KEYS);
  }

  const totals = report.pages.reduce(
    (acc, page) => addCounts(acc, page.totals),
    { danger: 0, warning: 0, caution: 0, info: 0 }
  );
  assert.deepEqual(totals, { danger: 32, warning: 450, caution: 578, info: 0 });
  assert.equal(totalCounts(totals), 1060);
});

test('final browser-vs-CLI benchmark is exact on every page and module', () => {
  const report = readJson(FINAL_BENCHMARK_PATH);
  const { summary } = report;

  assert.equal(summary.pageCount, 20);
  assert.equal(summary.moduleCount, 160);
  assert.equal(summary.exactPages, 20);
  assert.equal(summary.driftPages, 0);
  assert.equal(summary.errorPages, 0);
  assert.equal(summary.exactModules, 160);
  assert.equal(summary.driftModules, 0);
  assert.equal(summary.errorModules, 0);
  assert.deepEqual(summary.browserCounts, { danger: 32, warning: 450, caution: 578, info: 0 });
  assert.deepEqual(summary.cliCounts, summary.browserCounts);
  assert.deepEqual(summary.delta, { danger: 0, warning: 0, caution: 0, info: 0 });
  assert.equal(summary.browserTotal, 1060);
  assert.equal(summary.cliTotal, 1060);
  assert.equal(summary.totalDelta, 0);
  assert.equal(summary.browserSampleMatchCount, summary.browserSampleCount);

  for (const page of report.pages) {
    assert.equal(page.verdict, 'exact-counts', `${page.url} should have exact counts`);
    assert.equal(page.totalDelta, 0, `${page.url} should have zero total delta`);
    assert.equal(page.errorCount, 0, `${page.url} should have no CLI errors`);
    assert.equal(page.driftCount, 0, `${page.url} should have no drift modules`);
    for (const mod of page.modules) {
      assert.equal(mod.countMatch, true, `${page.url} ${mod.moduleKey} should match`);
      assert.equal(mod.totalDelta, 0, `${page.url} ${mod.moduleKey} should have zero delta`);
      assert.deepEqual(mod.delta, { danger: 0, warning: 0, caution: 0, info: 0 });
    }
  }
});

test('final benchmark graph artifacts are saved for article use', () => {
  for (const fileName of [
    'README.md',
    'browser-vs-cli-benchmark.html',
    'browser-vs-cli-benchmark.png',
    'page-totals.svg',
    'parity-scatter.svg',
    'module-delta-heatmap.svg',
  ]) {
    const filePath = path.join(GRAPH_ASSET_DIR, fileName);
    assert.ok(fs.existsSync(filePath), `Expected saved graph artifact: ${fileName}`);
    assert.ok(fs.statSync(filePath).size > 0, `Expected non-empty graph artifact: ${fileName}`);
  }
});
