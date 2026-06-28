'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBenchmarkReport,
  renderMarkdown,
  renderPageTotalsSvg,
  renderScatterSvg,
  renderModuleHeatmapSvg,
} = require('../src/benchmark.cjs');

const FIXTURE = {
  collectedAt: '2026-06-28T12:51:40.256Z',
  browserSource: 'live-ssa-bookmarklet',
  pageCount: 1,
  modules: [{ key: 'f', name: 'focusable' }],
  pages: [{
    url: 'https://example.test/',
    title: 'Example',
    status: 'ok',
    totals: { danger: 1, warning: 1, caution: 0, info: 0 },
    modules: [{
      moduleKey: 'f',
      module: 'focusable',
      andiVersion: '29.2.2',
      moduleVersion: 'fANDI: 7.0.0',
      counts: { danger: 1, warning: 1, caution: 0, info: 0 },
      sample: [{
        severity: 'danger',
        message: 'Button has no accessible name, innerText, or [title].',
        element: { tag: 'button', text: '' },
      }],
    }],
  }],
};

const CLI_RESULTS = [{
  url: 'https://example.test/',
  status: 'ok',
  elapsedMs: 100,
  modules: [{
    moduleKey: 'f',
    module: 'focusable',
    andiVersion: '29.2.2',
    moduleVersion: 'fANDI: 7.0.0',
    counts: { danger: 1, warning: 0, caution: 0, info: 0 },
    findings: [{
      severity: 'danger',
      message: 'Button has no accessible name, innerText, or [title].',
      element: { tag: 'button' },
    }],
  }],
}];

test('buildBenchmarkReport compares browser fixture counts to CLI counts', () => {
  const report = buildBenchmarkReport(FIXTURE, CLI_RESULTS, {
    moduleKeys: ['f'],
    timeoutMs: 45000,
    generatedAt: '2026-06-28T13:00:00.000Z',
  });

  assert.equal(report.summary.browserTotal, 2);
  assert.equal(report.summary.cliTotal, 1);
  assert.equal(report.summary.totalDelta, -1);
  assert.equal(report.summary.exactPages, 0);
  assert.equal(report.summary.driftPages, 1);
  assert.equal(report.summary.errorPages, 0);
  assert.equal(report.summary.browserSampleCount, 1);
  assert.equal(report.summary.browserSampleMatchCount, 1);
  assert.deepEqual(report.moduleTotals.f.delta, { danger: 0, warning: -1, caution: 0, info: 0 });
  assert.equal(report.pages[0].modules[0].verdict, 'count-drift');
});

test('benchmark renderers emit article artifacts', () => {
  const report = buildBenchmarkReport(FIXTURE, CLI_RESULTS, {
    moduleKeys: ['f'],
    timeoutMs: 45000,
    generatedAt: '2026-06-28T13:00:00.000Z',
  });

  assert.match(renderMarkdown(report), /Browser vs CLI ANDI Benchmark/);
  assert.match(renderPageTotalsSvg(report), /Finding totals by page/);
  assert.match(renderScatterSvg(report), /Parity scatter/);
  assert.match(renderModuleHeatmapSvg(report), /Module delta heatmap/);
});
