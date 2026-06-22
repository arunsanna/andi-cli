'use strict';
/**
 * test/cli-output-files.test.cjs — tests for --sarif, --html, and --junit output flags.
 *
 * Checks:
 *   1. --sarif <file>: writes a SARIF 2.1.0 shaped file (has $schema, version, runs)
 *   2. --html <file>: writes an HTML file containing the mandatory honesty banner
 *   3. Both flags together produce both files in the same scan
 *   4. Exit code is still determined by findings, not by file writing
 *   5. --junit <file>: writes a well-formed XML file with <testsuites> root
 *   6. --junit failures count is consistent with --fail-on threshold
 *   7. --junit does not change exit code or stdout
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { XMLParser } = require('fast-xml-parser');

const CLI = path.resolve(__dirname, '..', 'src', 'cli.cjs');
const REPO = path.resolve(__dirname, '..');
const FIXTURE_URL = 'file://' + path.join(REPO, 'examples', 'fixture.html');

function runCli(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { timeout: opts.timeout ?? 90_000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// 1. --sarif writes a valid SARIF-shaped JSON file
// ---------------------------------------------------------------------------
test('--sarif writes a SARIF 2.1.0 shaped JSON file', async () => {
  const sarifOut = path.join(os.tmpdir(), `andi-sarif-test-${Date.now()}.json`);
  try {
    const { code } = await runCli([
      '--url', FIXTURE_URL,
      '--fail-on', 'none',
      '--sarif', sarifOut,
    ]);
    // exit code unaffected (no findings threshold)
    assert.equal(code, 0, '--fail-on none should exit 0 regardless of findings');

    // File must exist
    assert.ok(fs.existsSync(sarifOut), `--sarif file must be written to ${sarifOut}`);

    // Must be valid JSON
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(fs.readFileSync(sarifOut, 'utf8')); },
      'SARIF output file must be valid JSON');

    // Must have top-level SARIF keys
    assert.equal(parsed.$schema, 'https://json.schemastore.org/sarif-2.1.0.json',
      'SARIF file must have correct $schema');
    assert.equal(parsed.version, '2.1.0', 'SARIF file must have version "2.1.0"');
    assert.ok(Array.isArray(parsed.runs), 'SARIF file must have a runs array');
    assert.equal(parsed.runs.length, 1, 'SARIF file must have exactly one run');
  } finally {
    if (fs.existsSync(sarifOut)) fs.unlinkSync(sarifOut);
  }
});

// ---------------------------------------------------------------------------
// 2. --html writes an HTML file with the mandatory honesty banner
// ---------------------------------------------------------------------------
test('--html writes an HTML file containing the honesty banner', async () => {
  const htmlOut = path.join(os.tmpdir(), `andi-html-test-${Date.now()}.html`);
  try {
    const { code } = await runCli([
      '--url', FIXTURE_URL,
      '--fail-on', 'none',
      '--html', htmlOut,
    ]);
    assert.equal(code, 0, '--fail-on none should exit 0');

    // File must exist
    assert.ok(fs.existsSync(htmlOut), `--html file must be written to ${htmlOut}`);

    const html = fs.readFileSync(htmlOut, 'utf8');

    // Must be an HTML document
    assert.ok(html.includes('<!doctype html'), 'HTML file must start with doctype');

    // Must include the mandatory honesty banner text
    assert.ok(
      html.includes('Automated checks cover a subset of Section 508'),
      'HTML report must include the mandatory honesty banner'
    );
  } finally {
    if (fs.existsSync(htmlOut)) fs.unlinkSync(htmlOut);
  }
});

// ---------------------------------------------------------------------------
// 3. --sarif and --html together both produce output in one scan
// ---------------------------------------------------------------------------
test('--sarif and --html together both write files in one scan', async () => {
  const sarifOut = path.join(os.tmpdir(), `andi-sarif-both-${Date.now()}.json`);
  const htmlOut  = path.join(os.tmpdir(), `andi-html-both-${Date.now()}.html`);
  try {
    const { code } = await runCli([
      '--url', FIXTURE_URL,
      '--fail-on', 'none',
      '--sarif', sarifOut,
      '--html', htmlOut,
    ]);
    assert.equal(code, 0, '--fail-on none should exit 0');
    assert.ok(fs.existsSync(sarifOut), 'SARIF file must be written');
    assert.ok(fs.existsSync(htmlOut),  'HTML file must be written');

    // Quick sanity: SARIF JSON parses; HTML has doctype
    const sarif = JSON.parse(fs.readFileSync(sarifOut, 'utf8'));
    assert.equal(sarif.version, '2.1.0');
    const html = fs.readFileSync(htmlOut, 'utf8');
    assert.ok(html.includes('<!doctype html'));
  } finally {
    if (fs.existsSync(sarifOut)) fs.unlinkSync(sarifOut);
    if (fs.existsSync(htmlOut))  fs.unlinkSync(htmlOut);
  }
});

// ---------------------------------------------------------------------------
// 5. --junit writes a well-formed XML file with <testsuites> root
// ---------------------------------------------------------------------------
test('--junit writes a well-formed XML file with testsuites root', async () => {
  const junitOut = path.join(os.tmpdir(), `andi-junit-test-${Date.now()}.xml`);
  try {
    const { code } = await runCli([
      '--url', FIXTURE_URL,
      '--fail-on', 'none',
      '--junit', junitOut,
    ]);
    assert.equal(code, 0, '--fail-on none should exit 0');

    assert.ok(fs.existsSync(junitOut), `--junit file must be written to ${junitOut}`);

    const xml = fs.readFileSync(junitOut, 'utf8');
    assert.ok(xml.length > 0, 'JUnit file must not be empty');

    // Must be well-formed XML parseable by fast-xml-parser
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    let parsed;
    assert.doesNotThrow(() => { parsed = parser.parse(xml); }, 'JUnit file must be well-formed XML');

    // Must have <testsuites> root element
    assert.ok(parsed.testsuites !== undefined, 'JUnit XML must have a <testsuites> root element');
  } finally {
    if (fs.existsSync(junitOut)) fs.unlinkSync(junitOut);
  }
});

// ---------------------------------------------------------------------------
// 6. --junit failures count is consistent with --fail-on threshold
// ---------------------------------------------------------------------------
test('--junit failures=0 with --fail-on none, failures>=0 with --fail-on danger', async () => {
  const junitNone = path.join(os.tmpdir(), `andi-junit-none-${Date.now()}.xml`);
  const junitDanger = path.join(os.tmpdir(), `andi-junit-danger-${Date.now()}.xml`);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  try {
    // --fail-on none: failOnRank=4, nothing is a failure → failures attribute must be 0
    await runCli(['--url', FIXTURE_URL, '--fail-on', 'none', '--junit', junitNone]);
    const noneXml = fs.readFileSync(junitNone, 'utf8');
    const noneParsed = parser.parse(noneXml);
    const noneFailures = parseInt(noneParsed.testsuites['@_failures'] ?? '0', 10);
    assert.equal(noneFailures, 0, '--fail-on none must produce failures=0 in JUnit XML');

    // --fail-on danger: fixture has danger findings; failures must be >= 1
    await runCli(['--url', FIXTURE_URL, '--fail-on', 'danger', '--junit', junitDanger]);
    const dangerXml = fs.readFileSync(junitDanger, 'utf8');
    const dangerParsed = parser.parse(dangerXml);
    const dangerFailures = parseInt(dangerParsed.testsuites['@_failures'] ?? '0', 10);
    assert.ok(dangerFailures >= 1,
      `--fail-on danger must produce failures>=1 in JUnit XML (got ${dangerFailures})`);
  } finally {
    if (fs.existsSync(junitNone)) fs.unlinkSync(junitNone);
    if (fs.existsSync(junitDanger)) fs.unlinkSync(junitDanger);
  }
});

// ---------------------------------------------------------------------------
// 7. --junit does not change the exit code or suppress stdout
// ---------------------------------------------------------------------------
test('--junit does not change exit code or suppress stdout', async () => {
  const junitOut = path.join(os.tmpdir(), `andi-junit-exitcode-${Date.now()}.xml`);
  try {
    // fixture has danger findings; --fail-on danger should still exit 1
    const { code, stdout } = await runCli([
      '--url', FIXTURE_URL,
      '--fail-on', 'danger',
      '--junit', junitOut,
    ]);
    assert.equal(code, 1, 'Fixture findings must still exit 1 with --fail-on danger when --junit is set');
    assert.ok(stdout.length > 0, 'stdout (text report) must not be suppressed by --junit');
    assert.ok(fs.existsSync(junitOut), '--junit file must still be written');
  } finally {
    if (fs.existsSync(junitOut)) fs.unlinkSync(junitOut);
  }
});

// ---------------------------------------------------------------------------
// 4. Exit code is still governed by findings, not by file output
// ---------------------------------------------------------------------------
test('--sarif and --html do not suppress the findings-based exit code', async () => {
  const sarifOut = path.join(os.tmpdir(), `andi-sarif-exit-${Date.now()}.json`);
  const htmlOut  = path.join(os.tmpdir(), `andi-html-exit-${Date.now()}.html`);
  try {
    // fixture has danger findings; --fail-on danger should still exit 1
    const { code } = await runCli([
      '--url', FIXTURE_URL,
      '--fail-on', 'danger',
      '--sarif', sarifOut,
      '--html', htmlOut,
    ]);
    assert.equal(code, 1, 'Fixture findings should still exit 1 with --fail-on danger, even with file outputs');
  } finally {
    if (fs.existsSync(sarifOut)) fs.unlinkSync(sarifOut);
    if (fs.existsSync(htmlOut))  fs.unlinkSync(htmlOut);
  }
});
