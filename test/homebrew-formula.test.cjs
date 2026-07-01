'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'generate-homebrew-formula.cjs');

test('generate-homebrew-formula creates macOS arm64/x64 formula with checksums', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'andi-homebrew-test-'));
  try {
    fs.writeFileSync(path.join(temp, 'andi-cli-1.0.0-macos-arm64.tar.gz'), 'arm');
    fs.writeFileSync(path.join(temp, 'andi-cli-1.0.0-macos-x64.tar.gz'), 'intel');
    const out = path.join(temp, 'andi-cli.rb');
    execFileSync(process.execPath, [
      SCRIPT,
      '--version', '1.0.0',
      '--asset-dir', temp,
      '--out', out,
    ]);
    const formula = fs.readFileSync(out, 'utf8');
    assert.match(formula, /class AndiCli < Formula/);
    assert.match(formula, /version "1\.0\.0"/);
    assert.match(formula, /andi-cli-1\.0\.0-macos-arm64\.tar\.gz/);
    assert.match(formula, /andi-cli-1\.0\.0-macos-x64\.tar\.gz/);
    assert.match(formula, /libexec\.install Dir\["\*"\]/);
    assert.match(formula, /assert_match "andi-scan"/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
