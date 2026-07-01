#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const opts = {
    owner: 'arunsanna',
    repo: 'andi-cli',
    out: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version') opts.version = argv[++i];
    else if (arg === '--asset-dir') opts.assetDir = argv[++i];
    else if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--owner') opts.owner = argv[++i];
    else if (arg === '--repo') opts.repo = argv[++i];
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

function usage() {
  return `Usage: node scripts/generate-homebrew-formula.cjs --version <version> --asset-dir <dir> [--out <file>]\n`;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function asset(version, target, ext) {
  return `andi-cli-${version}-${target}.${ext}`;
}

function formula({ version, owner, repo, macArmSha, macIntelSha }) {
  const tag = `v${version}`;
  const base = `https://github.com/${owner}/${repo}/releases/download/${tag}`;

  return `class AndiCli < Formula
  desc "Headless SSA ANDI Section 508 scanner for local and CI gates"
  homepage "https://github.com/${owner}/${repo}"
  version "${version}"
  license "Apache-2.0"

  on_macos do
    if Hardware::CPU.arm?
      url "${base}/${asset(version, 'macos-arm64', 'tar.gz')}"
      sha256 "${macArmSha}"
    end

    if Hardware::CPU.intel?
      url "${base}/${asset(version, 'macos-x64', 'tar.gz')}"
      sha256 "${macIntelSha}"
    end
  end

  def install
    libexec.install Dir["*"]
    (bin/"andi-scan").write <<~EOS
      #!/bin/sh
      exec "#{libexec}/bin/andi-scan" "$@"
    EOS
  end

  test do
    assert_match "andi-scan", shell_output("#{bin}/andi-scan --help")
  end
end
`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (!opts.version || !opts.assetDir) throw new Error(usage().trim());

  const assetDir = path.resolve(opts.assetDir);
  const macArm = path.join(assetDir, asset(opts.version, 'macos-arm64', 'tar.gz'));
  const macIntel = path.join(assetDir, asset(opts.version, 'macos-x64', 'tar.gz'));

  for (const file of [macArm, macIntel]) {
    if (!fs.existsSync(file)) throw new Error(`Missing release asset for Homebrew formula: ${file}`);
  }

  const content = formula({
    version: opts.version,
    owner: opts.owner,
    repo: opts.repo,
    macArmSha: sha256(macArm),
    macIntelSha: sha256(macIntel),
  });

  if (opts.out) {
    const out = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
    process.stdout.write(`${out}\n`);
  } else {
    process.stdout.write(content);
  }
}

main();
