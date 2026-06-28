'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(
  __dirname,
  'fixtures/browser-benchmark/live-browser-andi-20-pages.json'
);
const MARKDOWN_PATH = path.resolve(
  __dirname,
  'fixtures/browser-benchmark/live-browser-andi-20-pages.md'
);
const SEVERITIES = ['danger', 'warning', 'caution', 'info'];
const MODULE_KEYS = ['f', 'g', 'l', 't', 's', 'c', 'h', 'i'];

function readFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

function addCounts(a, b) {
  const out = { ...a };
  for (const severity of SEVERITIES) {
    out[severity] += b?.[severity] || 0;
  }
  return out;
}

function totalCounts(counts) {
  return SEVERITIES.reduce((sum, severity) => sum + (counts[severity] || 0), 0);
}

function pageByUrl(report, url) {
  const page = report.pages.find((entry) => entry.url === url);
  assert.ok(page, `Expected benchmark page: ${url}`);
  return page;
}

function moduleByKey(page, key) {
  const mod = page.modules.find((entry) => entry.moduleKey === key);
  assert.ok(mod, `Expected module ${key} for ${page.url}`);
  return mod;
}

function sampleFinding(page, moduleKey, predicate) {
  const mod = moduleByKey(page, moduleKey);
  return (mod.sample || []).find(predicate);
}

test('browser benchmark proof: frozen artifact documents the corrected live browser run', () => {
  const report = readFixture();

  assert.equal(report.tool, 'browser-andi-batch');
  assert.equal(report.browserSource, 'live-ssa-bookmarklet');
  assert.equal(report.collectedAt, '2026-06-28T12:51:40.256Z');
  assert.equal(report.pageCount, 20);
  assert.equal(report.pages.length, 20);
  assert.deepEqual(report.modules.map((entry) => entry.key), MODULE_KEYS);
  assert.ok(fs.existsSync(MARKDOWN_PATH), 'Expected human-readable benchmark proof markdown');
});

test('browser benchmark proof: every page completed with all ANDI modules', () => {
  const report = readFixture();

  for (const page of report.pages) {
    assert.equal(page.status, 'ok', `${page.url} should have completed`);
    assert.equal(page.moduleErrorCount, 0, `${page.url} should have no module collection errors`);
    assert.deepEqual(page.modules.map((entry) => entry.moduleKey), MODULE_KEYS);

    const moduleTotals = page.modules.reduce(
      (acc, mod) => addCounts(acc, mod.counts),
      { danger: 0, warning: 0, caution: 0, info: 0 }
    );
    assert.deepEqual(moduleTotals, page.totals, `${page.url} page totals should match module totals`);
    assert.equal(
      page.modules.reduce((sum, mod) => sum + (mod.total || 0), 0),
      totalCounts(page.totals),
      `${page.url} module totals should match page total`
    );
  }
});

test('browser benchmark proof: aggregate counts match the captured 20-page baseline', () => {
  const report = readFixture();
  const overall = report.pages.reduce(
    (acc, page) => addCounts(acc, page.totals),
    { danger: 0, warning: 0, caution: 0, info: 0 }
  );
  const byModule = {};

  for (const page of report.pages) {
    for (const mod of page.modules) {
      byModule[mod.moduleKey] ||= {
        module: mod.module,
        danger: 0,
        warning: 0,
        caution: 0,
        info: 0,
        total: 0,
      };
      byModule[mod.moduleKey] = {
        ...byModule[mod.moduleKey],
        ...addCounts(byModule[mod.moduleKey], mod.counts),
        total: byModule[mod.moduleKey].total + (mod.total || 0),
      };
    }
  }

  assert.deepEqual(overall, { danger: 33, warning: 448, caution: 573, info: 0 });
  assert.equal(totalCounts(overall), 1054);
  assert.deepEqual(byModule, {
    f: { module: 'focusable', danger: 3, warning: 82, caution: 75, info: 0, total: 160 },
    g: { module: 'graphics', danger: 1, warning: 18, caution: 411, info: 0, total: 430 },
    l: { module: 'links', danger: 1, warning: 202, caution: 54, info: 0, total: 257 },
    t: { module: 'tables', danger: 2, warning: 0, caution: 0, info: 0, total: 2 },
    s: { module: 'structures', danger: 0, warning: 2, caution: 28, info: 0, total: 30 },
    c: { module: 'contrast', danger: 26, warning: 128, caution: 5, info: 0, total: 159 },
    h: { module: 'hidden', danger: 0, warning: 16, caution: 0, info: 0, total: 16 },
    i: { module: 'iframes', danger: 0, warning: 0, caution: 0, info: 0, total: 0 },
  });
});

test('browser benchmark proof: article-ready page examples are preserved', () => {
  const report = readFixture();
  const pages = [
    ['https://www.access-board.gov/ict/', { danger: 0, warning: 75, caution: 388, info: 0 }],
    ['https://science.nasa.gov/solar-system/', { danger: 8, warning: 131, caution: 121, info: 0 }],
    ['https://www.nasa.gov/', { danger: 16, warning: 16, caution: 0, info: 0 }],
    ['https://www.nist.gov/', { danger: 7, warning: 18, caution: 5, info: 0 }],
    [
      'https://www.cdc.gov/wcms/4.0/cdc-wp/data-presentation/table.html',
      { danger: 1, warning: 21, caution: 1, info: 0 },
    ],
    ['https://www.w3.org/WAI/tutorials/forms/', { danger: 0, warning: 3, caution: 0, info: 0 }],
    ['https://www.access-board.gov/ta/', { danger: 1, warning: 2, caution: 5, info: 0 }],
  ];

  for (const [url, counts] of pages) {
    assert.deepEqual(pageByUrl(report, url).totals, counts);
  }

  const cdcTable = pageByUrl(
    report,
    'https://www.cdc.gov/wcms/4.0/cdc-wp/data-presentation/table.html'
  );
  assert.ok(sampleFinding(
    cdcTable,
    't',
    (finding) => finding.severity === 'danger'
      && finding.message === 'Table has no <th> or <td> cells.'
  ));

  const nasa = pageByUrl(report, 'https://www.nasa.gov/');
  assert.ok(sampleFinding(
    nasa,
    'c',
    (finding) => finding.severity === 'danger'
      && finding.message.includes('large text minimum AA contrast ratio')
      && finding.element?.text === 'Observing the Planet'
  ));

  const scienceNasa = pageByUrl(report, 'https://science.nasa.gov/solar-system/');
  assert.ok(sampleFinding(
    scienceNasa,
    'f',
    (finding) => finding.severity === 'danger'
      && finding.message === 'Link has no accessible name, innerText, or [title].'
  ));
  assert.ok(sampleFinding(
    scienceNasa,
    'f',
    (finding) => finding.severity === 'danger'
      && finding.message === 'Tab Element has no accessible name.'
  ));
  assert.ok(sampleFinding(
    scienceNasa,
    'f',
    (finding) => finding.severity === 'danger'
      && finding.message.includes('duplicate id [id=search-field-en-small--desktop]')
  ));

  const nist = pageByUrl(report, 'https://www.nist.gov/');
  assert.ok(sampleFinding(
    nist,
    'g',
    (finding) => finding.severity === 'danger'
      && finding.message === '[role=img] Element has no accessible name.'
  ));

  const accessBoardTa = pageByUrl(report, 'https://www.access-board.gov/ta/');
  assert.ok(sampleFinding(
    accessBoardTa,
    't',
    (finding) => finding.severity === 'danger'
      && finding.message === 'Table has no <th> cells.'
  ));
});
