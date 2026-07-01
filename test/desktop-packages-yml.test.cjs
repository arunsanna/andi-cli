'use strict';
/**
 * Structural validation for .github/workflows/desktop-packages.yml.
 *
 * The workflow is the Windows proof path for portable desktop packages, so this
 * test guards the matrix and artifact/smoke steps from accidental drift.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const WORKFLOW = path.resolve(
  __dirname,
  '..',
  '.github',
  'workflows',
  'desktop-packages.yml'
);

let workflow;

function loadWorkflow() {
  if (!workflow) {
    assert.ok(fs.existsSync(WORKFLOW), `desktop package workflow must exist at ${WORKFLOW}`);
    workflow = yaml.load(fs.readFileSync(WORKFLOW, 'utf8'));
  }
  return workflow;
}

function allSteps(wf) {
  const steps = [];
  for (const job of Object.values(wf.jobs || {})) {
    for (const step of job.steps || []) steps.push(step);
  }
  return steps;
}

test('desktop-packages.yml: exists and parses as valid YAML', () => {
  assert.doesNotThrow(() => loadWorkflow(), 'desktop package workflow must be valid YAML');
  assert.equal(loadWorkflow().name, 'Desktop packages');
});

test('desktop-packages.yml: has manual, push, and pull_request triggers', () => {
  const wf = loadWorkflow();
  const trigger = wf['on'] !== undefined ? wf['on'] : wf[true];
  assert.ok(trigger, 'workflow must define triggers');
  assert.ok(trigger.workflow_dispatch !== undefined, 'workflow must support manual dispatch');
  assert.ok(trigger.push, 'workflow must run on push');
  assert.ok(trigger.pull_request, 'workflow must run on pull_request');
});

test('desktop-packages.yml: includes macOS and Windows proof matrix', () => {
  const wf = loadWorkflow();
  const job = wf.jobs && wf.jobs.package;
  assert.ok(job, 'workflow must have package job');
  const include = job.strategy?.matrix?.include || [];
  const targets = include.map((entry) => entry.target).sort();
  assert.deepEqual(targets, ['macos-arm64', 'macos-x64', 'windows-x64']);
  assert.ok(include.some((entry) => entry.target === 'windows-x64' && entry.os === 'windows-latest'));
  assert.ok(include.some((entry) => entry.target === 'macos-arm64' && entry.os === 'macos-15'));
  assert.ok(include.some((entry) => entry.target === 'macos-x64' && entry.os === 'macos-15-intel'));
});

test('desktop-packages.yml: builds and smoke-tests the package', () => {
  const steps = allSteps(loadWorkflow());
  assert.ok(
    steps.some((step) => step.run && step.run.includes('npm run package:desktop')),
    'workflow must build desktop package'
  );
  assert.ok(
    steps.some((step) => step.run && step.run.includes('npm run smoke:desktop-package')),
    'workflow must smoke-test desktop package'
  );
});

test('desktop-packages.yml: uploads packages and smoke logs as artifacts', () => {
  const steps = allSteps(loadWorkflow());
  const upload = steps.find((step) => step.uses && step.uses.includes('actions/upload-artifact'));
  assert.ok(upload, 'workflow must upload artifacts');
  const artifactPath = String(upload.with?.path || '');
  assert.ok(artifactPath.includes('dist/desktop/*.zip'), 'workflow must upload Windows zip');
  assert.ok(artifactPath.includes('dist/desktop/*.tar.gz'), 'workflow must upload macOS tarballs');
  assert.ok(artifactPath.includes('dist/desktop/*.smoke.json'), 'workflow must upload smoke logs');
});
