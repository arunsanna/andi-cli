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

## Notes on `bypassCSP`

The scan runner creates each Playwright browser context with `bypassCSP: true`. This is a **testing-time flag** applied to the automated scan's browser context only. It is the correct tool for an automated accessibility scanner because it prevents the target page's Content Security Policy from blocking script injection (which is intentional: we are running an automated test, not browsing as a user).

This flag does **not** change what real users experience on the target page. It does not defeat authentication, bot-detection walls, or any protection other than CSP header enforcement within the scan context.

The scanner is a read-only analysis tool. It does not submit forms, mutate state on the target, or store credentials.

## HTML report injection

The HTML reporter (`--html`) includes element snippets extracted from the scanned page. The reporter HTML-escapes untrusted content before embedding it in the report. If you find a way to inject unescaped HTML or JavaScript into the generated report file, please report it as a vulnerability.
