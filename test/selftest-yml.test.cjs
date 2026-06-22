'use strict';
/**
 * test/selftest-yml.test.cjs — structural validation of .github/workflows/selftest.yml
 *
 * Checks:
 *   1. File parses as valid YAML
 *   2. Triggers: push and pull_request on main
 *   3. Has an npm test step
 *   4. Has a clean-fixture step (scanning clean.html, expects exit 0)
 *   5. Has an inverted violation-gate step (scanning focusable.html, expects non-zero)
 *   6. Has a SARIF smoke step (runs with --sarif and asserts valid JSON)
 *   7. Has setup-node with node 20
 *   8. Has playwright install step
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const SELFTEST_YML = path.resolve(
  __dirname, '..', '.github', 'workflows', 'selftest.yml'
);

let wf;

function loadWorkflow() {
  if (!wf) {
    assert.ok(
      fs.existsSync(SELFTEST_YML),
      `selftest.yml must exist at ${SELFTEST_YML}`
    );
    wf = yaml.load(fs.readFileSync(SELFTEST_YML, 'utf8'));
  }
  return wf;
}

function allSteps(workflow) {
  const steps = [];
  for (const job of Object.values(workflow.jobs || {})) {
    for (const step of job.steps || []) {
      steps.push(step);
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 1. File exists and parses as valid YAML
// ---------------------------------------------------------------------------
test('selftest.yml: exists and parses as valid YAML', () => {
  assert.doesNotThrow(() => loadWorkflow(), 'selftest.yml must be valid YAML');
  const wf = loadWorkflow();
  assert.ok(wf && typeof wf === 'object', 'parsed workflow must be an object');
});

// ---------------------------------------------------------------------------
// 2. Triggers: push and pull_request on main
// ---------------------------------------------------------------------------
test('selftest.yml: triggers push and pull_request on main', () => {
  const wf = loadWorkflow();
  const on = wf.on || wf.true; // js-yaml parses bare `on` key as boolean true
  // When js-yaml parses `on:` as a key it may show as true (boolean) in some
  // versions — access via the workflow object's own keys
  const trigger = wf['on'] !== undefined ? wf['on'] : wf[true];
  assert.ok(trigger, 'workflow must have an "on" trigger key');
  assert.ok(trigger.push, 'workflow must have a push trigger');
  assert.ok(trigger.pull_request, 'workflow must have a pull_request trigger');
  const pushBranches = trigger.push.branches || [];
  const prBranches = trigger.pull_request.branches || [];
  assert.ok(
    pushBranches.includes('main'),
    `push trigger must include main, got: ${JSON.stringify(pushBranches)}`
  );
  assert.ok(
    prBranches.includes('main'),
    `pull_request trigger must include main, got: ${JSON.stringify(prBranches)}`
  );
});

// ---------------------------------------------------------------------------
// 3. Has an npm test step
// ---------------------------------------------------------------------------
test('selftest.yml: has an "npm test" step', () => {
  const wf = loadWorkflow();
  const steps = allSteps(wf);
  const npmTestStep = steps.find(
    (s) => s.run && /npm\s+test/.test(s.run)
  );
  assert.ok(npmTestStep, 'selftest.yml must have a step that runs npm test');
});

// ---------------------------------------------------------------------------
// 4. Has a clean-fixture step (clean.html exit 0 dogfood check)
// ---------------------------------------------------------------------------
test('selftest.yml: has a clean-fixture dogfood step (clean.html → exit 0)', () => {
  const wf = loadWorkflow();
  const steps = allSteps(wf);
  const cleanStep = steps.find(
    (s) => s.run && s.run.includes('clean.html')
  );
  assert.ok(
    cleanStep,
    'selftest.yml must have a step that scans clean.html'
  );
  // The step should use --fail-on danger (or none), asserting exit 0
  assert.ok(
    cleanStep.run.includes('--fail-on'),
    'clean.html step must pass --fail-on flag'
  );
});

// ---------------------------------------------------------------------------
// 5. Has an inverted violation-gate step (focusable.html → assert non-zero)
// ---------------------------------------------------------------------------
test('selftest.yml: has an inverted violation-gate step (focusable.html → non-zero)', () => {
  const wf = loadWorkflow();
  const steps = allSteps(wf);
  // Find the step that references focusable.html — must use inverted logic
  const gateStep = steps.find(
    (s) => s.run && s.run.includes('focusable.html')
  );
  assert.ok(
    gateStep,
    'selftest.yml must have a step that scans focusable.html'
  );
  // The step must be inverted (if...then exit 1; else...) so it passes when scan exits non-zero
  const run = gateStep.run;
  assert.ok(
    run.includes('exit 1') || run.includes('ERROR'),
    'violation-gate step must invert the exit code (exit 1 on unexpected success)'
  );
  // Must also use --fail-on danger
  assert.ok(
    run.includes('--fail-on danger'),
    `violation-gate step must use --fail-on danger, got: ${run}`
  );
});

// ---------------------------------------------------------------------------
// 6. Has a SARIF smoke step
// ---------------------------------------------------------------------------
test('selftest.yml: has a SARIF smoke step (--sarif + valid JSON check)', () => {
  const wf = loadWorkflow();
  const steps = allSteps(wf);
  const sarifStep = steps.find(
    (s) => s.run && s.run.includes('--sarif')
  );
  assert.ok(
    sarifStep,
    'selftest.yml must have a step that uses --sarif'
  );
  // Should verify the file exists and is valid JSON
  assert.ok(
    sarifStep.run.includes('JSON.parse') || sarifStep.run.includes('node -e') || sarifStep.run.includes('python') || sarifStep.run.includes('test -f'),
    `SARIF step should verify file is valid JSON, got: ${sarifStep.run}`
  );
});

// ---------------------------------------------------------------------------
// 7. Has setup-node step with node 20
// ---------------------------------------------------------------------------
test('selftest.yml: has setup-node step with node-version 20', () => {
  const wf = loadWorkflow();
  const steps = allSteps(wf);
  const setupNode = steps.find(
    (s) => s.uses && s.uses.includes('setup-node')
  );
  assert.ok(setupNode, 'selftest.yml must have an actions/setup-node step');
  const withBlock = setupNode.with || {};
  const nodeVersion = String(withBlock['node-version'] || '');
  assert.ok(
    nodeVersion.startsWith('20'),
    `setup-node must use node-version 20, got: ${nodeVersion}`
  );
});

// ---------------------------------------------------------------------------
// 8. Has playwright install step
// ---------------------------------------------------------------------------
test('selftest.yml: has a playwright install step', () => {
  const wf = loadWorkflow();
  const steps = allSteps(wf);
  const pwStep = steps.find(
    (s) => s.run && s.run.includes('playwright install')
  );
  assert.ok(
    pwStep,
    'selftest.yml must have a step that installs Playwright (npx playwright install)'
  );
  assert.ok(
    pwStep.run.includes('chromium'),
    `playwright install step must target chromium, got: ${pwStep.run}`
  );
});
