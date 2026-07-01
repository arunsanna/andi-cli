#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
const buildRoot = path.join(DIST_ROOT, 'build', packageName);
const archivePath = path.join(
  DIST_ROOT,
  `${packageName}${process.platform === 'win32' ? '.zip' : '.tar.gz'}`
);
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageNodeVersion = process.env.ANDI_CLI_PACKAGE_NODE_VERSION || process.versions.node;

function log(message) {
  process.stdout.write(`[package:desktop] ${message}\n`);
}

function rm(pathToRemove) {
  fs.rmSync(pathToRemove, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    dereference: false,
    filter: (source) => {
      const rel = path.relative(REPO_ROOT, source);
      if (!rel) return true;
      if (rel.startsWith(`dist${path.sep}`)) return false;
      if (rel.startsWith(`node_modules${path.sep}`)) return false;
      if (rel.includes(`${path.sep}.DS_Store`)) return false;
      return true;
    },
  });
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'inherit',
    timeout: options.timeoutMs,
  });
}

function nodeRuntimeDescriptor() {
  const nodePlatform = process.platform === 'win32' ? 'win' : process.platform;
  const nodeArch = process.arch;
  const extension = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const folder = `node-v${packageNodeVersion}-${nodePlatform}-${nodeArch}`;
  const file = `${folder}.${extension}`;
  return {
    folder,
    file,
    url: `https://nodejs.org/dist/v${packageNodeVersion}/${file}`,
    cacheArchive: path.join(DIST_ROOT, 'cache', file),
    extractRoot: path.join(DIST_ROOT, 'cache', folder),
  };
}

function downloadFile(url, destination) {
  ensureDir(path.dirname(destination));
  if (fs.existsSync(destination)) return;
  run('curl', ['-fL', url, '-o', destination], { timeoutMs: 10 * 60 * 1000 });
}

function extractNodeRuntime(descriptor) {
  const nodeBinary = process.platform === 'win32'
    ? path.join(descriptor.extractRoot, descriptor.folder, 'node.exe')
    : path.join(descriptor.extractRoot, descriptor.folder, 'bin', 'node');
  if (fs.existsSync(nodeBinary)) return nodeBinary;

  rm(descriptor.extractRoot);
  ensureDir(descriptor.extractRoot);
  if (process.platform === 'win32') {
    const command = [
      'Expand-Archive',
      '-LiteralPath',
      psQuote(descriptor.cacheArchive),
      '-DestinationPath',
      psQuote(descriptor.extractRoot),
      '-Force',
    ].join(' ');
    run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
  } else {
    run('tar', ['-xzf', descriptor.cacheArchive, '-C', descriptor.extractRoot]);
  }
  if (!fs.existsSync(nodeBinary)) throw new Error(`Node runtime did not extract to ${nodeBinary}`);
  return nodeBinary;
}

function playwrightCacheRoot() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  }
  return path.join(os.homedir(), '.cache', 'ms-playwright');
}

function headlessShellRevision() {
  const browsersJson = require(path.join(buildRoot, 'node_modules', 'playwright-core', 'browsers.json'));
  const browser = browsersJson.browsers.find((entry) => entry.name === 'chromium-headless-shell');
  if (!browser) throw new Error('Playwright browsers.json does not list chromium-headless-shell');
  return browser.revision;
}

function hermeticHeadlessShellDir(revision) {
  return path.join(
    buildRoot,
    'node_modules',
    'playwright-core',
    '.local-browsers',
    `chromium_headless_shell-${revision}`
  );
}

function cachedHeadlessShellDir(revision) {
  return path.join(playwrightCacheRoot(), `chromium_headless_shell-${revision}`);
}

function expectedHeadlessShellExecutable(browserDir) {
  if (process.platform === 'win32') {
    return path.join(browserDir, 'chrome-win', 'headless_shell.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(browserDir, 'chrome-mac', 'headless_shell');
  }
  return path.join(browserDir, 'chrome-linux', 'headless_shell');
}

function hasUsableHeadlessShell(browserDir) {
  return fs.existsSync(expectedHeadlessShellExecutable(browserDir));
}

function copyCachedHeadlessShellIfPresent(revision) {
  const source = cachedHeadlessShellDir(revision);
  if (!hasUsableHeadlessShell(source)) return false;

  const destination = hermeticHeadlessShellDir(revision);
  rm(destination);
  ensureDir(path.dirname(destination));
  log(`copy cached ${source}`);
  copyDir(source, destination);
  return hasUsableHeadlessShell(destination);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function copyRuntime() {
  const runtimeDir = path.join(buildRoot, 'runtime');
  ensureDir(runtimeDir);

  const descriptor = nodeRuntimeDescriptor();
  log(`download Node runtime ${descriptor.url}`);
  downloadFile(descriptor.url, descriptor.cacheArchive);
  const nodeBinary = extractNodeRuntime(descriptor);

  if (process.platform === 'win32') {
    copyFile(nodeBinary, path.join(runtimeDir, 'node.exe'));
    return;
  }

  copyFile(nodeBinary, path.join(runtimeDir, 'node'));
  fs.chmodSync(path.join(runtimeDir, 'node'), 0o755);
}

function writeLaunchers() {
  const binDir = path.join(buildRoot, 'bin');
  ensureDir(binDir);

  const shellLauncher = `#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export PLAYWRIGHT_BROWSERS_PATH=0
exec "$ROOT/runtime/node" "$ROOT/src/cli.cjs" "$@"
`;
  fs.writeFileSync(path.join(binDir, 'andi-scan'), shellLauncher);
  fs.chmodSync(path.join(binDir, 'andi-scan'), 0o755);

  const cmdLauncher = `@echo off
setlocal
set "ROOT=%~dp0.."
set "PLAYWRIGHT_BROWSERS_PATH=0"
"%ROOT%\\runtime\\node.exe" "%ROOT%\\src\\cli.cjs" %*
exit /b %ERRORLEVEL%
`;
  fs.writeFileSync(path.join(binDir, 'andi-scan.cmd'), cmdLauncher);

  const psLauncher = `$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:PLAYWRIGHT_BROWSERS_PATH = "0"
& (Join-Path $root "runtime\\node.exe") (Join-Path $root "src\\cli.cjs") @args
exit $LASTEXITCODE
`;
  fs.writeFileSync(path.join(binDir, 'andi-scan.ps1'), psLauncher);
}

function writeManifest() {
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    target,
    platform: process.platform,
    arch: process.arch,
    packageNodeVersion,
    buildNode: process.version,
    packagedAt: new Date().toISOString(),
    command: process.platform === 'win32' ? 'bin\\andi-scan.cmd' : 'bin/andi-scan',
    notes: [
      'Portable developer bundle.',
      'Playwright Chromium headless shell is installed hermetically under node_modules/playwright-core/.local-browsers.',
      'The launchers set PLAYWRIGHT_BROWSERS_PATH=0 before running the CLI.',
    ],
  };
  fs.writeFileSync(
    path.join(buildRoot, 'BUNDLE-MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

function installProductionDependencies() {
  run(npmCmd, ['ci', '--omit=dev'], { cwd: buildRoot });
  const revision = headlessShellRevision();
  if (copyCachedHeadlessShellIfPresent(revision)) return;

  const playwrightCli = path.join(buildRoot, 'node_modules', 'playwright', 'cli.js');
  run(
    process.execPath,
    [playwrightCli, 'install', '--only-shell', 'chromium'],
    {
      cwd: buildRoot,
      env: {
        PLAYWRIGHT_BROWSERS_PATH: '0',
        PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '120000',
        PLAYWRIGHT_SKIP_BROWSER_GC: '1',
      },
      timeoutMs: 10 * 60 * 1000,
    }
  );
  if (!hasUsableHeadlessShell(hermeticHeadlessShellDir(revision))) {
    throw new Error(`Playwright install did not create ${expectedHeadlessShellExecutable(hermeticHeadlessShellDir(revision))}`);
  }
}

function writeReadme() {
  const readme = `# ${pkg.name} ${pkg.version} ${target}

This is a portable developer bundle for andi-scan.

## Run

macOS:

\`\`\`bash
./bin/andi-scan --help
./bin/andi-scan --url https://example.com --module all --fail-on danger
\`\`\`

Windows PowerShell:

\`\`\`powershell
.\\bin\\andi-scan.ps1 --help
.\\bin\\andi-scan.ps1 --url https://example.com --module all --fail-on danger
\`\`\`

Windows Command Prompt:

\`\`\`bat
bin\\andi-scan.cmd --help
bin\\andi-scan.cmd --url https://example.com --module all --fail-on danger
\`\`\`

See \`README.md\` for install and usage, and \`docs/troubleshooting.md\` for
deeper troubleshooting.
`;
  fs.writeFileSync(path.join(buildRoot, 'README-PACKAGE.md'), readme);
}

function createArchive() {
  rm(archivePath);

  if (process.platform === 'win32') {
    const command = [
      'Compress-Archive',
      '-LiteralPath',
      psQuote(buildRoot),
      '-DestinationPath',
      psQuote(archivePath),
      '-Force',
    ].join(' ');
    run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
    return;
  }

  run('tar', ['-czf', archivePath, '-C', path.dirname(buildRoot), path.basename(buildRoot)]);
}

function main() {
  log(`target ${target}`);
  rm(buildRoot);
  ensureDir(buildRoot);
  ensureDir(DIST_ROOT);

  for (const file of ['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'NOTICE']) {
    copyFile(path.join(REPO_ROOT, file), path.join(buildRoot, file));
  }

  for (const dir of ['src', 'andi', 'examples']) {
    copyDir(path.join(REPO_ROOT, dir), path.join(buildRoot, dir));
  }

  ensureDir(path.join(buildRoot, 'docs'));
  for (const doc of ['troubleshooting.md', 'output-schema.md']) {
    const source = path.join(REPO_ROOT, 'docs', doc);
    if (fs.existsSync(source)) copyFile(source, path.join(buildRoot, 'docs', doc));
  }
  for (const dir of ['roadmap']) {
    const source = path.join(REPO_ROOT, 'docs', dir);
    if (fs.existsSync(source)) copyDir(source, path.join(buildRoot, 'docs', dir));
  }

  copyRuntime();
  writeLaunchers();
  writeManifest();
  writeReadme();
  installProductionDependencies();
  createArchive();

  const bytes = fs.statSync(archivePath).size;
  const manifest = {
    target,
    packageName,
    archivePath,
    archiveBytes: bytes,
    archiveMiB: Number((bytes / 1024 / 1024).toFixed(1)),
  };
  fs.writeFileSync(
    path.join(DIST_ROOT, `${packageName}.package.json`),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  log(`wrote ${archivePath} (${manifest.archiveMiB} MiB)`);
}

main();
