# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities through [GitHub's private vulnerability reporting](https://github.com/arunsanna/andi-cli/security/advisories/new) rather than opening a public issue. This keeps the details confidential until a fix is available.

Include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a minimal proof-of-concept.
- The version of `andi-cli` you tested against.

You can expect an acknowledgment within 5 business days and a resolution timeline within 14 business days for confirmed issues.

## Supported versions

Only the latest release on `main` receives security fixes. There are no long-term support branches at this time.

## Scope

### In scope

- The `andi-scan` CLI and its output formats (JSON, SARIF, JUnit, HTML).
- The Playwright-based scan runner (`src/scanner.cjs`, `src/vendor-route.cjs`, related modules).
- The GitHub Actions composite action (`.github/actions/andi-scan/`).
- The Docker image (`Dockerfile`, `ghcr.io/arunsanna/andi-cli`).

### Out of scope

- The vendored `andi/` directory — that is the upstream SSA ANDI tool. Vulnerabilities in ANDI itself should be reported to the [SSA ANDI project](https://github.com/SSAgov/ANDI).
- The target pages you choose to scan — the scanner has no control over those.

## Untrusted-page execution model

andi-cli loads arbitrary URLs in headless Chromium. **Every scanned page is untrusted.** This is fundamental to how an automated accessibility scanner works.

Specifically:

- Each module scan runs in a **fresh, ephemeral `BrowserContext`** with `bypassCSP: true`. The context is closed as soon as the module scan completes.
- There is **no `storageState`**, no cookie jar, no shared credentials, and no persistent profile between scans.
- `bypassCSP: true` is a **testing-time flag** that prevents the target page's CSP headers from blocking ANDI's script injection. It does not affect the Chromium sandbox or disable other browser security mitigations.
- Chromium is launched with default sandbox settings — no `--no-sandbox` or equivalent flags are passed.

The main residual risk is a **browser exploit via hostile page**: a maliciously crafted scan target could exploit a Chromium vulnerability to escape the browser sandbox. Mitigations:

1. Keep Playwright (and therefore Chromium) up to date.
2. Run andi-cli in isolated CI environments (containers / VMs), not on privileged developer workstations.
3. Do not scan URLs from untrusted sources — the operator is responsible for choosing scan targets.

A full threat model is documented in [`docs/security/threat-model.md`](docs/security/threat-model.md).

## HTML report injection

The HTML reporter (`--html`) includes element snippets extracted from the scanned page. The reporter HTML-escapes all untrusted content (messages, element HTML, rule IDs, selectors, URLs, engine names) before embedding. The `esc()` function covers `&`, `<`, `>`, `"`, and `'`, which handles both HTML-content and HTML-attribute contexts. If you find a way to inject unescaped HTML or JavaScript into the generated report file, please report it as a vulnerability.

## SARIF / JUnit output

SARIF output is serialised as JSON (`JSON.stringify`). JUnit XML output uses an `esc()` helper covering `<`, `>`, `&`, `"`, `'`. Neither format embeds untrusted data via raw string concatenation.

## Vendor routing and path traversal

`src/vendor-route.cjs` intercepts Playwright page requests and serves ANDI assets from the local `andi/` tree. The file-path guard uses `f.startsWith(ANDI_DIR + path.sep)` (with the OS path separator) to prevent the sibling-directory prefix bypass (`andi-evil/` would satisfy `startsWith("andi")` without the separator suffix). `path.join` normalises any `..` segments before the guard is evaluated.

## Dependencies

Production dependencies are minimal: only `playwright` is a direct production dependency. Playwright is pinned to a specific patch version. Run `npm audit` to check for known vulnerabilities.
