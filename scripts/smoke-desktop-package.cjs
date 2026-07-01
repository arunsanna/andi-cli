#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_ROOT = path.join(REPO_ROOT, 'dist', 'desktop');
const pkg = require(path.join(REPO_ROOT, 'package.json'));

const platformName = {
  darwin: 'macos',
  win32: 'windows',
  linux: 'linux',
}[process.platform] || process.platform;

const archName = {
  arm64: 'arm64',
  x64: 'x64',
}[process.arch] || process.arch;

const target = `${platformName}-${archName}`;
const packageName = `${pkg.name}-${pkg.version}-${target}`;
const defaultArchive = path.join(
  DIST_ROOT,
  `${packageName}${process.platform === 'win32' ? '.zip' : '.tar.gz'}`
);

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--archive') opts.archive = argv[++i];
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
}

function log(message) {
  process.stdout.write(`[smoke:desktop-package] ${message}\n`);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function extractArchive(archive, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  if (archive.endsWith('.zip')) {
    const command = [
      'Expand-Archive',
      '-LiteralPath',
      psQuote(archive),
      '-DestinationPath',
      psQuote(destination),
      '-Force',
    ].join(' ');
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      stdio: 'inherit',
    });
    return;
  }

  execFileSync('tar', ['-xzf', archive, '-C', destination], { stdio: 'inherit' });
}

function findPackageRoot(destination) {
  const entries = fs.readdirSync(destination, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const dir of dirs) {
    const candidate = path.join(destination, dir);
    if (fs.existsSync(path.join(candidate, 'bin')) && fs.existsSync(path.join(candidate, 'src'))) {
      return candidate;
    }
  }
  if (dirs.length === 1) return path.join(destination, dirs[0]);
  if (fs.existsSync(path.join(destination, 'bin')) && fs.existsSync(path.join(destination, 'src'))) {
    return destination;
  }
  throw new Error(`cannot identify extracted package root under ${destination}`);
}

function commandFor(root) {
  if (process.platform === 'win32') return path.join(root, 'bin', 'andi-scan.cmd');
  return path.join(root, 'bin', 'andi-scan');
}

function runCli(root, args, expectedCode, name) {
  const command = commandFor(root);
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 120_000,
  });
  const code = result.status === null ? 124 : result.status;
  const entry = {
    name,
    args,
    expectedCode,
    code,
    durationMs: Date.now() - startedAt,
    stdoutTail: (result.stdout || '').slice(-2000),
    stderrTail: (result.stderr || '').slice(-2000),
  };
  if (result.error) entry.error = result.error.message;
  if (code !== expectedCode) {
    const details = JSON.stringify(entry, null, 2);
    throw new Error(`${name} exited ${code}, expected ${expectedCode}\n${details}`);
  }
  return entry;
}

function assertFile(filePath, description) {
  if (!fs.existsSync(filePath)) throw new Error(`${description} was not written: ${filePath}`);
  if (fs.statSync(filePath).size === 0) throw new Error(`${description} is empty: ${filePath}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`Usage: node scripts/smoke-desktop-package.cjs [--archive <path>]\n`);
    process.exit(0);
  }

  const archive = path.resolve(opts.archive || defaultArchive);
  if (!fs.existsSync(archive)) throw new Error(`archive not found: ${archive}`);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'andi-cli-package-smoke-'));
  const outDir = path.join(temp, 'outputs');

  const logPath = path.join(DIST_ROOT, `${path.basename(archive).replace(/\.(zip|tar\.gz)$/, '')}.smoke.json`);
  const cleanUrl = pathToFileURL(path.join(REPO_ROOT, 'test', 'fixtures', 'clean.html')).href;
  const violationUrl = pathToFileURL(path.join(REPO_ROOT, 'test', 'fixtures', 'focusable.html')).href;
  const jsonOut = path.join(outDir, 'clean.json');
  const sarifOut = path.join(outDir, 'clean.sarif');
  const htmlOut = path.join(outDir, 'clean.html');

  try {
    log(`extracting ${archive}`);
    extractArchive(archive, temp);
    fs.mkdirSync(outDir, { recursive: true });
    const root = findPackageRoot(temp);
    log(`testing ${root}`);

    const checks = [];
    checks.push(runCli(root, ['--help'], 0, 'help exits 0'));
    checks.push(runCli(root, [
      '--url', cleanUrl,
      '--module', 'all',
      '--fail-on', 'danger',
      '--quiet',
      '--out', jsonOut,
      '--sarif', sarifOut,
      '--html', htmlOut,
    ], 0, 'clean fixture exits 0 and writes reports'));
    checks.push(runCli(root, [
      '--url', violationUrl,
      '--module', 'f',
      '--fail-on', 'danger',
      '--quiet',
    ], 1, 'violation fixture exits 1'));

    assertFile(jsonOut, 'JSON report');
    assertFile(sarifOut, 'SARIF report');
    assertFile(htmlOut, 'HTML report');

    JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    const sarif = JSON.parse(fs.readFileSync(sarifOut, 'utf8'));
    if (sarif.version !== '2.1.0') throw new Error('SARIF report is not version 2.1.0');
    const html = fs.readFileSync(htmlOut, 'utf8');
    if (!html.includes('Automated checks cover a subset of Section 508')) {
      throw new Error('HTML report missing honesty banner');
    }

    const payload = {
      target,
      archive,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      checkedAt: new Date().toISOString(),
      checks,
    };
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `${JSON.stringify(payload, null, 2)}\n`);
    log(`wrote ${logPath}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main();
