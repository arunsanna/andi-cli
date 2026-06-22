'use strict';
/**
 * test/report-junit.test.cjs — unit tests for the JUnit XML reporter.
 *
 * Validation V7: calls toJunit() with a synthetic aggregate result containing BOTH
 * an element-enriched finding (danger) AND an element:null finding (iframes warning),
 * then parses the XML output with fast-xml-parser and asserts structural correctness.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { XMLParser } = require('fast-xml-parser');

const { toJunit } = require('../src/report/junit.cjs');

// ---------------------------------------------------------------------------
// fast-xml-parser config: keep attributes and do not collapse arrays
// ---------------------------------------------------------------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  isArray: (name) => ['testsuite', 'testcase'].includes(name),
});

// ---------------------------------------------------------------------------
// Synthetic aggregate result — covers both element shapes
// ---------------------------------------------------------------------------
const FINDING_WITH_ELEMENT = {
  engine: 'andi',
  module: 'focusable',
  severity: 'danger',
  rule: 'no-accessible-name',
  message: 'Button has no accessible name',
  wcag: ['4.1.2'],
  url: 'https://example.com/',
  element: {
    tag: 'button',
    html: '<button id="btn1">x</button>',
    selector: '#btn1',
    andiIndex: 1,
  },
};

// element:null finding (iframes module — s/h/i have no per-element node)
const FINDING_NULL_ELEMENT = {
  engine: 'andi',
  module: 'iframes',
  severity: 'warning',
  rule: 'iframe-no-title',
  message: 'Iframe has no accessible name or [title]',
  wcag: ['4.1.2', '2.4.1'],
  url: 'https://example.com/',
  element: null,
};

const SYNTHETIC_RESULT = {
  url: 'https://example.com/',
  version: '0.1.0',
  urls: ['https://example.com/'],
  findings: [FINDING_WITH_ELEMENT, FINDING_NULL_ELEMENT],
  counts: { danger: 1, warning: 1, caution: 0, info: 0 },
  worst: 'danger',
};

// ---------------------------------------------------------------------------
// Test 1: toJunit does not throw on element:null findings (guard — same class as SARIF fix)
// ---------------------------------------------------------------------------
test('toJunit: does not throw when element is null', () => {
  assert.doesNotThrow(
    () => toJunit(SYNTHETIC_RESULT),
    'toJunit must not throw when a finding has element:null',
  );
});

// ---------------------------------------------------------------------------
// Test 2: output is well-formed XML (fast-xml-parser must parse without error)
// ---------------------------------------------------------------------------
test('toJunit: output is well-formed XML', () => {
  const xml = toJunit(SYNTHETIC_RESULT);
  assert.equal(typeof xml, 'string', 'toJunit must return a string');
  // XMLParser.parse() throws on malformed XML when validating
  let parsed;
  assert.doesNotThrow(() => {
    parsed = parser.parse(xml);
  }, 'XML output must be well-formed');
  assert.ok(parsed, 'parsed result must be truthy');
});

// ---------------------------------------------------------------------------
// Test 3 (V7): <testsuites failures="N"> where N equals findings with rank >= failOnRank
// ---------------------------------------------------------------------------
test('toJunit: testsuites failures count equals findings at or above failOnRank', () => {
  // default failOnRank=3 → only "danger" (rank 3) qualifies
  const xml = toJunit(SYNTHETIC_RESULT, 3);
  const parsed = parser.parse(xml);
  const ts = parsed.testsuites;
  assert.ok(ts, 'root element must be <testsuites>');

  const failures = Number(ts['@_failures']);
  // Only FINDING_WITH_ELEMENT is danger (rank 3); FINDING_NULL_ELEMENT is warning (rank 2)
  assert.equal(failures, 1, 'testsuites failures must be 1 (one danger finding)');

  // Total tests = 2 (one per finding)
  const tests = Number(ts['@_tests']);
  assert.equal(tests, 2, 'testsuites tests must be 2');
});

// ---------------------------------------------------------------------------
// Test 4: failure element exists for failing finding; self-closing testcase for non-failing
// ---------------------------------------------------------------------------
test('toJunit: failure element for failing finding; no failure element for passing finding', () => {
  const xml = toJunit(SYNTHETIC_RESULT, 3);
  const parsed = parser.parse(xml);
  const suites = parsed.testsuites.testsuite;
  assert.ok(Array.isArray(suites), 'testsuite must be an array');

  // Collect all testcase nodes across all suites
  const allCases = suites.flatMap((s) => s.testcase || []);
  assert.equal(allCases.length, 2, 'must have exactly 2 testcase elements');

  // The danger finding must have a <failure> child
  const failing = allCases.find((tc) => tc.failure !== undefined);
  assert.ok(failing, 'must have at least one testcase with a <failure> element');

  // The warning finding must NOT have a <failure> child
  const passing = allCases.find((tc) => tc.failure === undefined);
  assert.ok(passing, 'must have at least one testcase without a <failure> element');
});

// ---------------------------------------------------------------------------
// Test 5: failOnRank=2 counts both findings as failures
// ---------------------------------------------------------------------------
test('toJunit: failOnRank=2 counts warning and danger as failures', () => {
  const xml = toJunit(SYNTHETIC_RESULT, 2);
  const parsed = parser.parse(xml);
  const failures = Number(parsed.testsuites['@_failures']);
  assert.equal(failures, 2, 'testsuites failures must be 2 when failOnRank=2');
});

// ---------------------------------------------------------------------------
// Test 6: XML escaping — dangerous characters in message/html are escaped
// ---------------------------------------------------------------------------
test('toJunit: dangerous characters in message are XML-escaped', () => {
  const result = {
    urls: ['https://example.com/'],
    findings: [
      {
        engine: 'andi',
        module: 'focusable',
        severity: 'danger',
        rule: 'xss-test',
        message: 'Contains <script>alert("xss")</script> & apostrophe\'s',
        url: 'https://example.com/',
        element: { tag: 'div', html: '<div data-x="y">text</div>', selector: '#d1', andiIndex: 2 },
      },
    ],
    counts: { danger: 1, warning: 0, caution: 0, info: 0 },
  };
  const xml = toJunit(result, 3);
  // Must not contain raw < > & " ' that would break XML (beyond the declaration and element tags)
  // Verify that the raw unescaped string is NOT present inside attribute/text content
  assert.ok(!xml.includes('<script>'), 'raw <script> must not appear in XML output');
  // But the escaped form must be present
  assert.ok(xml.includes('&lt;script&gt;'), 'escaped &lt;script&gt; must appear in XML output');
});
