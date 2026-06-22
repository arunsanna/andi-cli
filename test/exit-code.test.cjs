'use strict';
/**
 * test/exit-code.test.cjs — unit tests for the pure exitCode(worst, failOn) function.
 *
 * Full matrix:
 *   worst      | danger | warning | caution | none
 *   -----------|--------|---------|---------|-----
 *   'danger'   |   1    |    1    |    1    |  0
 *   'warning'  |   0    |    1    |    1    |  0
 *   'caution'  |   0    |    0    |    1    |  0
 *   null       |   0    |    0    |    0    |  0
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exitCode } = require('../src/cli.cjs');

// ---------------------------------------------------------------------------
// worst = 'danger'
// ---------------------------------------------------------------------------

test('exitCode: danger + fail-on danger → 1', () => {
  assert.equal(exitCode('danger', 'danger'), 1);
});

test('exitCode: danger + fail-on warning → 1', () => {
  assert.equal(exitCode('danger', 'warning'), 1);
});

test('exitCode: danger + fail-on caution → 1', () => {
  assert.equal(exitCode('danger', 'caution'), 1);
});

test('exitCode: danger + fail-on none → 0', () => {
  assert.equal(exitCode('danger', 'none'), 0);
});

// ---------------------------------------------------------------------------
// worst = 'warning'
// ---------------------------------------------------------------------------

test('exitCode: warning + fail-on danger → 0', () => {
  assert.equal(exitCode('warning', 'danger'), 0);
});

test('exitCode: warning + fail-on warning → 1', () => {
  assert.equal(exitCode('warning', 'warning'), 1);
});

test('exitCode: warning + fail-on caution → 1', () => {
  assert.equal(exitCode('warning', 'caution'), 1);
});

test('exitCode: warning + fail-on none → 0', () => {
  assert.equal(exitCode('warning', 'none'), 0);
});

// ---------------------------------------------------------------------------
// worst = 'caution'
// ---------------------------------------------------------------------------

test('exitCode: caution + fail-on danger → 0', () => {
  assert.equal(exitCode('caution', 'danger'), 0);
});

test('exitCode: caution + fail-on warning → 0', () => {
  assert.equal(exitCode('caution', 'warning'), 0);
});

test('exitCode: caution + fail-on caution → 1', () => {
  assert.equal(exitCode('caution', 'caution'), 1);
});

test('exitCode: caution + fail-on none → 0', () => {
  assert.equal(exitCode('caution', 'none'), 0);
});

// ---------------------------------------------------------------------------
// worst = null (no findings)
// ---------------------------------------------------------------------------

test('exitCode: null + fail-on danger → 0', () => {
  assert.equal(exitCode(null, 'danger'), 0);
});

test('exitCode: null + fail-on warning → 0', () => {
  assert.equal(exitCode(null, 'warning'), 0);
});

test('exitCode: null + fail-on caution → 0', () => {
  assert.equal(exitCode(null, 'caution'), 0);
});

test('exitCode: null + fail-on none → 0', () => {
  assert.equal(exitCode(null, 'none'), 0);
});

// ---------------------------------------------------------------------------
// worst = undefined (defensive — treat same as null)
// ---------------------------------------------------------------------------

test('exitCode: undefined + fail-on danger → 0', () => {
  assert.equal(exitCode(undefined, 'danger'), 0);
});

test('exitCode: undefined + fail-on caution → 0', () => {
  assert.equal(exitCode(undefined, 'caution'), 0);
});
