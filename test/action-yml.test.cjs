'use strict';
/**
 * test/action-yml.test.cjs — structural validation of the composite GitHub Action.
 *
 * RED phase: fails before .github/actions/andi-scan/action.yml exists.
 *
 * Checks:
 *   1. File parses as valid YAML
 *   2. runs.using === 'composite'
 *   3. All documented inputs are declared
 *   4. There is an upload-sarif step (uses: github/codeql-action/upload-sarif)
 *   5. There is a node-setup step (uses: actions/setup-node)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const ACTION_YML = path.resolve(__dirname, '..', '.github', 'actions', 'andi-scan', 'action.yml');

const REQUIRED_INPUTS = ['url', 'dir', 'urls', 'modules', 'fail-on', 'with-axe', 'sarif', 'html', 'strict-offline'];

// js-yaml v4: yaml.load() uses DEFAULT_SCHEMA — safe by default.
// yaml.safeLoad was removed in v4; yaml.load IS the safe function.
const safeLoad = yaml.load;

let action;

// ---------------------------------------------------------------------------
// 1. File exists and parses as valid YAML
// ---------------------------------------------------------------------------
test('action.yml exists and parses as valid YAML', () => {
  assert.ok(fs.existsSync(ACTION_YML), `action.yml must exist at ${ACTION_YML}`);
  assert.doesNotThrow(() => {
    action = safeLoad(fs.readFileSync(ACTION_YML, 'utf8'));
  }, 'action.yml must be valid YAML');
  assert.ok(action && typeof action === 'object', 'parsed action must be an object');
});

// ---------------------------------------------------------------------------
// 2. runs.using === 'composite'
// ---------------------------------------------------------------------------
test('action.yml: runs.using is "composite"', () => {
  if (!action) action = safeLoad(fs.readFileSync(ACTION_YML, 'utf8'));
  assert.ok(action.runs, 'action must have a "runs" key');
  assert.equal(action.runs.using, 'composite', 'runs.using must be "composite"');
});

// ---------------------------------------------------------------------------
// 3. All documented inputs are declared
// ---------------------------------------------------------------------------
test('action.yml: all required inputs are declared', () => {
  if (!action) action = safeLoad(fs.readFileSync(ACTION_YML, 'utf8'));
  const inputs = action.inputs || {};
  for (const inp of REQUIRED_INPUTS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(inputs, inp),
      `action.yml must declare input "${inp}"`
    );
  }
});

// ---------------------------------------------------------------------------
// 4. There is an upload-sarif step
// ---------------------------------------------------------------------------
test('action.yml: has an upload-sarif step (github/codeql-action/upload-sarif)', () => {
  if (!action) action = safeLoad(fs.readFileSync(ACTION_YML, 'utf8'));
  const steps = (action.runs && action.runs.steps) || [];
  assert.ok(steps.length > 0, 'action must have at least one step');
  const uploadStep = steps.find(
    (s) => s.uses && s.uses.includes('upload-sarif')
  );
  assert.ok(uploadStep, 'action must have a step that uses upload-sarif');
  assert.ok(
    uploadStep.uses.includes('codeql-action'),
    `upload-sarif step should use github/codeql-action, got: ${uploadStep.uses}`
  );
});

// ---------------------------------------------------------------------------
// 5. There is a setup-node step
// ---------------------------------------------------------------------------
test('action.yml: has a setup-node step (actions/setup-node)', () => {
  if (!action) action = safeLoad(fs.readFileSync(ACTION_YML, 'utf8'));
  const steps = (action.runs && action.runs.steps) || [];
  const setupStep = steps.find(
    (s) => s.uses && s.uses.includes('setup-node')
  );
  assert.ok(setupStep, 'action must have a step that uses actions/setup-node');
});

// ---------------------------------------------------------------------------
// 6. upload-sarif step has if: always() guard
// ---------------------------------------------------------------------------
test('action.yml: upload-sarif step has if: always() guard', () => {
  if (!action) action = safeLoad(fs.readFileSync(ACTION_YML, 'utf8'));
  const steps = (action.runs && action.runs.steps) || [];
  const uploadStep = steps.find(
    (s) => s.uses && s.uses.includes('upload-sarif')
  );
  assert.ok(uploadStep, 'action must have an upload-sarif step');
  assert.equal(
    uploadStep.if,
    'always()',
    'upload-sarif step must have "if: always()" so it runs even when the scan gate fails'
  );
});
