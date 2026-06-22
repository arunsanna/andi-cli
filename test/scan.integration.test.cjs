'use strict';
/**
 * test/scan.integration.test.cjs — per-module fixture + CSP integration suite.
 *
 * Task 1.7: closes AC-002. Each fixture has exactly one planted, documented
 * violation. Severities below are OBSERVED from live ANDI v29.2.2 runs and
 * amended if they differed from the brief.
 *
 * Module behaviour (grounded by spikes/06 + extract.cjs design):
 *   f/c/t/g/l → produce .ANDI508-element-* highlights → element: <object>
 *   s/h/i     → alerts-list only, no per-element highlights → element: null
 *
 * Runs one shared browser for all scan cases; exits cleanly.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFile } = require('child_process');
const { chromium } = require('playwright');
const { scanModule } = require('../src/modules.cjs');

const REPO = path.resolve(__dirname, '..');
const FIX = (name) => 'file://' + path.join(REPO, 'test', 'fixtures', name + '.html');
const CLI = path.resolve(REPO, 'src', 'cli.cjs');

function runCli(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { timeout: opts.timeout ?? 90000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: assert a finding has a non-null element (for modules f/c/t/g/l)
// ---------------------------------------------------------------------------
function assertElementPresent(finding, label) {
  assert.ok(
    finding.element !== null && typeof finding.element === 'object',
    `${label}: expected element object, got ${JSON.stringify(finding.element)}`
  );
}

// ---------------------------------------------------------------------------
// Per-module fixture scans — one shared browser
// ---------------------------------------------------------------------------

test('integration: focusable fixture → ≥1 danger finding with element', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('focusable'), 'f');
    assert.ok(findings.length >= 1, `focusable: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'focusable', `focusable: all findings must have module=focusable`);
    }
    const dangers = findings.filter((f) => f.severity === 'danger');
    assert.ok(dangers.length >= 1, `focusable: expected ≥1 danger finding, got ${JSON.stringify(findings.map((f) => f.severity))}`);
    assertElementPresent(dangers[0], 'focusable danger');
  } finally {
    await browser.close();
  }
});

test('integration: contrast fixture → ≥1 danger finding with element', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('contrast'), 'c');
    assert.ok(findings.length >= 1, `contrast: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'contrast', `contrast: all findings must have module=contrast`);
    }
    const dangers = findings.filter((f) => f.severity === 'danger');
    assert.ok(dangers.length >= 1, `contrast: expected ≥1 danger finding, got ${JSON.stringify(findings.map((f) => f.severity))}`);
    assertElementPresent(dangers[0], 'contrast danger');
  } finally {
    await browser.close();
  }
});

test('integration: tables fixture → ≥1 danger finding with element', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('tables'), 't');
    assert.ok(findings.length >= 1, `tables: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'tables', `tables: all findings must have module=tables`);
    }
    const dangers = findings.filter((f) => f.severity === 'danger');
    assert.ok(dangers.length >= 1, `tables: expected ≥1 danger finding, got ${JSON.stringify(findings.map((f) => f.severity))}`);
    assertElementPresent(dangers[0], 'tables danger');
  } finally {
    await browser.close();
  }
});

test('integration: graphics fixture → ≥1 danger finding with element', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('graphics'), 'g');
    assert.ok(findings.length >= 1, `graphics: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'graphics', `graphics: all findings must have module=graphics`);
    }
    const dangers = findings.filter((f) => f.severity === 'danger');
    assert.ok(dangers.length >= 1, `graphics: expected ≥1 danger finding, got ${JSON.stringify(findings.map((f) => f.severity))}`);
    assertElementPresent(dangers[0], 'graphics danger');
  } finally {
    await browser.close();
  }
});

test('integration: links fixture → ≥1 danger finding with element', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('links'), 'l');
    assert.ok(findings.length >= 1, `links: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'links', `links: all findings must have module=links`);
    }
    const dangers = findings.filter((f) => f.severity === 'danger');
    assert.ok(dangers.length >= 1, `links: expected ≥1 danger finding, got ${JSON.stringify(findings.map((f) => f.severity))}`);
    assertElementPresent(dangers[0], 'links danger');
  } finally {
    await browser.close();
  }
});

test('integration: structures fixture → ≥1 caution finding with element:null', async () => {
  // s module defaults to headings sub-mode; <div role="heading"> without
  // aria-level triggers a caution per spikes/06 grounding.
  // OBSERVED (empirical, 2026-06-21, ANDI v29.2.2): severity=caution.
  // element:null because s/h/i produce no per-element highlights.
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('structures'), 's');
    assert.ok(findings.length >= 1, `structures: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'structures', `structures: all findings must have module=structures`);
      assert.strictEqual(f.element, null, `structures: all findings must have element:null (no per-element flags)`);
    }
    const cautions = findings.filter((f) => f.severity === 'caution');
    assert.ok(
      cautions.length >= 1,
      `structures: expected ≥1 caution finding (empirically observed). Got: ${JSON.stringify(findings.map((f) => f.severity))}`
    );
  } finally {
    await browser.close();
  }
});

test('integration: hidden fixture → ≥1 warning finding with element:null', async () => {
  // h module: CSS ::before pseudo-content injection triggers a warning.
  // OBSERVED (empirical, 2026-06-21, ANDI v29.2.2): severity=warning.
  // element:null because h produces no per-element highlights.
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('hidden'), 'h');
    assert.ok(findings.length >= 1, `hidden: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'hidden', `hidden: all findings must have module=hidden`);
      assert.strictEqual(f.element, null, `hidden: all findings must have element:null`);
    }
    const warnings = findings.filter((f) => f.severity === 'warning');
    assert.ok(
      warnings.length >= 1,
      `hidden: expected ≥1 warning finding (empirically observed). Got: ${JSON.stringify(findings.map((f) => f.severity))}`
    );
  } finally {
    await browser.close();
  }
});

test('integration: iframes fixture → ≥1 warning finding with element:null and message matching /no accessible name/i', async () => {
  // i module: untitled <iframe> → "Iframe has no accessible name or [title]"
  // OBSERVED (empirical, 2026-06-21, ANDI v29.2.2): severity=warning (NOT danger).
  // Note: the task brief said "danger" for iframes; the live ANDI v29.2.2 emits "warning".
  // element:null because i produces no per-element highlights.
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('iframes'), 'i');
    assert.ok(findings.length >= 1, `iframes: expected ≥1 finding, got ${findings.length}`);
    for (const f of findings) {
      assert.equal(f.module, 'iframes', `iframes: all findings must have module=iframes`);
      assert.strictEqual(f.element, null, `iframes: all findings must have element:null`);
    }
    const iframeMsg = findings.find((f) => /no accessible name/i.test(f.message));
    assert.ok(
      iframeMsg !== undefined,
      `iframes: expected a finding with message matching /no accessible name/i. Got: ${JSON.stringify(findings.map((f) => f.message))}`
    );
    // Assert observed severity: warning (not danger as the task brief estimated)
    const warnings = findings.filter((f) => f.severity === 'warning');
    assert.ok(
      warnings.length >= 1,
      `iframes: expected ≥1 warning finding (empirically observed). Got: ${JSON.stringify(findings.map((f) => f.severity))}`
    );
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// CSP fixture: bypassCSP:true allows injection despite restrictive meta-CSP
// ---------------------------------------------------------------------------

test('integration: csp fixture → ≥1 danger finding despite meta CSP (bypassCSP:true)', async () => {
  // csp.html has <meta http-equiv="Content-Security-Policy" content="script-src 'self'">
  // plus a planted <button></button> (no accessible name → danger).
  // scanModule always uses bypassCSP:true (Decision 3) so injection must succeed.
  const browser = await chromium.launch({ headless: true });
  try {
    const { findings } = await scanModule(browser, FIX('csp'), 'f');
    const dangers = findings.filter((f) => f.severity === 'danger');
    assert.ok(
      dangers.length >= 1,
      `csp: expected ≥1 danger finding (bypassCSP:true bypasses meta CSP). Got: ${JSON.stringify(findings.map((f) => ({ s: f.severity, m: f.message })))}`
    );
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// Exit-code integration: CLI exit codes with per-module fixtures
// ---------------------------------------------------------------------------

test('integration exit-code: focusable + --module f --fail-on danger → exit 1', async () => {
  const { code } = await runCli([
    '--url', FIX('focusable'),
    '--module', 'f',
    '--fail-on', 'danger',
  ]);
  assert.equal(code, 1, 'focusable danger fixture should exit 1 with --fail-on danger');
});

test('integration exit-code: structures + --module s --fail-on danger → exit 0', async () => {
  // structures fixture has caution/warning at worst; --fail-on danger threshold is not met
  const { code } = await runCli([
    '--url', FIX('structures'),
    '--module', 's',
    '--fail-on', 'danger',
  ]);
  assert.equal(code, 0, 'structures caution/warning fixture should exit 0 with --fail-on danger');
});
