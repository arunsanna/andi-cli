'use strict';
/**
 * Structural validation for .github/workflows/release.yml.
 *
 * The release workflow is responsible for producing public GitHub Release
 * downloads and the Homebrew formula asset.
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
  'release.yml'
);

let workflow;

function loadWorkflow() {
  if (!workflow) {
    assert.ok(fs.existsSync(WORKFLOW), `release workflow must exist at ${WORKFLOW}`);
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

test('release.yml: exists and parses as valid YAML', () => {
  assert.doesNotThrow(() => loadWorkflow(), 'release workflow must be valid YAML');
  assert.equal(loadWorkflow().name, 'Release');
});

test('release.yml: triggers only on version tags', () => {
  const wf = loadWorkflow();
  const trigger = wf['on'] !== undefined ? wf['on'] : wf[true];
  assert.deepEqual(trigger.push.tags, ['v*']);
});

test('release.yml: package matrix includes macOS and Windows targets', () => {
  const job = loadWorkflow().jobs.package;
  assert.ok(job, 'release workflow must have a package job');
  const include = job.strategy?.matrix?.include || [];
  const targets = include.map((entry) => entry.target).sort();
  assert.deepEqual(targets, ['macos-arm64', 'macos-x64', 'windows-x64']);
});

test('release.yml: validates tag, builds, and smoke-tests packages', () => {
  const steps = allSteps(loadWorkflow());
  assert.ok(steps.some((step) => step.name === 'Validate tag matches package version'));
  assert.ok(steps.some((step) => step.run && step.run.includes('npm run package:desktop')));
  assert.ok(steps.some((step) => step.run && step.run.includes('npm run smoke:desktop-package')));
});

test('release.yml: publishes checksums, formula, packages, and smoke logs', () => {
  const steps = allSteps(loadWorkflow());
  assert.ok(steps.some((step) => step.run && step.run.includes('SHA256SUMS.txt')));
  assert.ok(steps.some((step) => step.run && step.run.includes('generate-homebrew-formula.cjs')));
  const publish = steps.find((step) => step.name === 'Publish release assets');
  assert.ok(publish, 'release workflow must publish release assets');
  const run = publish.run || '';
  assert.ok(run.includes('release-assets/*.tar.gz'));
  assert.ok(run.includes('release-assets/*.zip'));
  assert.ok(run.includes('release-assets/*.smoke.json'));
  assert.ok(run.includes('release-assets/andi-cli.rb'));
});

test('release.yml: has guarded Homebrew tap update step', () => {
  const steps = allSteps(loadWorkflow());
  const step = steps.find((entry) => entry.name === 'Update Homebrew tap');
  assert.ok(step, 'release workflow must include Homebrew tap update step');
  assert.equal(step.if, "${{ vars.UPDATE_HOMEBREW_TAP == 'true' }}");
  assert.equal(step.env.GH_TOKEN, '${{ secrets.HOMEBREW_TAP_TOKEN }}');
  assert.ok((step.run || '').includes('arunsanna/homebrew-tap.git'));
});
