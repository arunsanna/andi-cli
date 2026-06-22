# andi-cli

**Headless CLI + CI wrapper for the U.S. SSA [ANDI](https://www.ssa.gov/accessibility/andi/help/install.html) (Accessible Name & Description Inspector) — the tool the federal Section 508 Trusted-Tester process is keyed to.**

This repository is forked from [SSAgov/ANDI](https://github.com/SSAgov/ANDI). The `andi/` directory is the unmodified upstream vendored tree. The wrapper code (`src/`, `test/`, `.github/`, `docs/`) drives that official ANDI in headless Chromium and emits structured, CI-gateable results.

> **Honest coverage boundary.** Automated checks cover a **subset** of Section 508. ANDI surfaces items for human Trusted-Tester judgment; this tool does not replace that review. Do not interpret a clean scan as a compliance certification.

## Why ANDI in CI?

The U.S. federal Trusted-Tester process requires alignment with ANDI's exact alert set — not generic engines like axe-core, pa11y, or Lighthouse. ANDI ships only as a manual browser bookmarklet. `andi-cli` closes the gap: it drives the **unmodified official `andi.js`** inside headless Chromium so the output matches what a human Trusted-Tester would see, and it emits that output in formats a CI system can gate on.

## Quickstart

### npx (no install required)

```bash
npx andi-scan --url https://example.com
npx andi-scan --url https://example.com --fail-on danger --sarif andi.sarif
```

### Docker

```bash
# Pull and scan a URL
docker run --rm ghcr.io/arunsanna/andi-cli --url https://example.com

# Scan a local file (mount the working directory)
docker run --rm -v "$PWD:/work" ghcr.io/arunsanna/andi-cli \
  --url file:///work/path/to/page.html --fail-on danger
```

### GitHub Actions

```yaml
- uses: arunsanna/andi-cli/.github/actions/andi-scan@main
  with:
    url: https://your-staging-url.example.com
    fail-on: danger
    sarif: andi-results.sarif
```

Full configuration options: [`docs/ci/github.md`](docs/ci/github.md)

## Install (local development)

```bash
git clone https://github.com/arunsanna/andi-cli
cd andi-cli
npm install
npx playwright install chromium
```

## Usage

```bash
# Human-readable report (default: focusable module)
andi-scan --url https://example.com

# JSON output for pipelines
andi-scan --url https://staging.example.com --json --out report.json

# CI gate: exit 1 when danger-level findings are present
andi-scan --url https://staging.example.com --fail-on danger

# Run all ANDI modules
andi-scan --url https://staging.example.com --module all --fail-on warning

# Scan multiple URLs from a file
andi-scan --urls urls.txt --module all --fail-on danger

# Scan a sitemap
andi-scan --sitemap https://example.com/sitemap.xml --concurrency 4

# Hermetic mode: fail if any external network request is attempted
andi-scan --url https://example.com --strict-offline

# Optional second engine (requires @axe-core/playwright)
andi-scan --url https://example.com --with-axe

# Built-in fixture (has deliberate violations)
npm run test:fixture
```

Run `andi-scan --help` for the full flag reference.

## Flags

| Flag                    | Default  | Description                                                                                                                               |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--url <url>`           | _(none)_ | Page to scan (`http://`, `https://`, or `file://`). Required unless `--urls` or `--sitemap` is given.                                     |
| `--urls <file>`         | _(none)_ | Newline-separated file of URLs (`#` = comment line).                                                                                      |
| `--sitemap <url\|file>` | _(none)_ | Sitemap XML to fetch or read; scans all `<loc>` entries.                                                                                  |
| `--concurrency <n>`     | `1`      | Number of pages to scan in parallel.                                                                                                      |
| `--module <key\|all>`   | `f`      | ANDI module(s): `f`=focusable, `g`=graphics, `l`=links, `t`=tables, `s`=structures, `c`=contrast, `h`=hidden, `i`=iframes, `all`=run all. |
| `--fail-on <level>`     | `danger` | Exit 1 when worst finding severity ≥ level: `danger`\|`warning`\|`caution`\|`none`.                                                       |
| `--json`                | off      | Print full results as JSON to stdout.                                                                                                     |
| `--out <file>`          | _(none)_ | Write JSON results to a file.                                                                                                             |
| `--sarif <file>`        | _(none)_ | Write SARIF 2.1.0 results (for GitHub code scanning).                                                                                     |
| `--html <file>`         | _(none)_ | Write a self-contained HTML report.                                                                                                       |
| `--junit <file>`        | _(none)_ | Write JUnit XML results (for CI test dashboards).                                                                                         |
| `--strict-offline`      | off      | Exit 2 if any external network requests are attempted during the scan.                                                                    |
| `--with-axe`            | off      | Optional second engine; requires the optional `@axe-core/playwright` dep. Runs axe-core alongside ANDI and labels each finding by engine. |
| `--timeout <ms>`        | `30000`  | Per-step timeout in milliseconds.                                                                                                         |
| `--quiet`               | off      | Suppress the human-readable report (use with `--json`/`--out`).                                                                           |

### Exit codes

| Code | Meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| `0`  | No findings at or above `--fail-on`, or `--fail-on none`.                   |
| `1`  | One or more findings at or above the threshold.                             |
| `2`  | Scan error, or `--strict-offline` triggered by an external network request. |

## ANDI modules

| Key | Module     | What it checks                                                         |
| --- | ---------- | ---------------------------------------------------------------------- |
| `f` | focusable  | Elements that receive keyboard focus — accessible names, roles, states |
| `g` | graphics   | Images and graphic elements — alt text, accessible names               |
| `l` | links      | Link accessible names and context                                      |
| `t` | tables     | Table markup — headers, captions, structure                            |
| `s` | structures | Headings, landmarks, lists, ARIA roles                                 |
| `c` | contrast   | Color contrast ratios                                                  |
| `h` | hidden     | Hidden / off-screen content injected via CSS                           |
| `i` | iframes    | iframes — title and accessible name                                    |

## Output formats

| Format      | Flag               | Purpose                                      |
| ----------- | ------------------ | -------------------------------------------- |
| Text        | _(default)_        | Human report with honesty banner             |
| JSON        | `--json` / `--out` | Machine processing and pipelines             |
| SARIF 2.1.0 | `--sarif <file>`   | GitHub code scanning — inline PR annotations |
| JUnit XML   | `--junit <file>`   | CI test dashboards (GitHub, GitLab, Jenkins) |
| HTML        | `--html <file>`    | Shareable report for VPAT/ACR authors        |

Every human-facing report carries the honesty banner: _"Automated checks cover a subset of Section 508; ANDI surfaces items for human Trusted-Tester judgment."_

## How it works

1. The target URL loads in headless Chromium (Playwright) with a `bypassCSP: true` context so CSP headers on federal `.gov` targets cannot block script injection.
2. Every ANDI asset (`andi.js`, `andi.css`, module files, icons, pinned jQuery) is served from the local `andi/` vendored tree via `page.route()`. No network requests reach `ssa.gov` or any other host during a scan. `--strict-offline` fails the run loudly if anything slips through.
3. ANDI auto-launches on injection. For multi-module scans each module runs in a fresh page context via `AndiModule.launchModule(letter)`, which avoids the flakiness of in-place module switching.
4. Findings are extracted from the ANDI DOM (`#ANDI508-alerts-list` for all modules; `.ANDI508-element-*` highlights as enrichment for modules `f/c/t/g/l`). ANDI's internal JS objects are not used — they proved unreliable in grounding spikes (see `docs/ARCHITECTURE.md` Decision 4).
5. Findings are aggregated across modules, mapped to WCAG success criteria where possible, and rendered to the requested output formats with a CI exit code.

The `bypassCSP` flag is a Playwright testing-time context option. It is the correct tool for an automated scanner and does not alter what real users experience on the target page.

## CI integrations

- **GitHub Actions:** [`docs/ci/github.md`](docs/ci/github.md) — composite action with SARIF upload and inline PR annotations
- **GitLab CI:** [`docs/ci/gitlab.md`](docs/ci/gitlab.md) — YAML job with JUnit artifact
- **Jenkins:** [`docs/ci/jenkins.md`](docs/ci/jenkins.md) — pipeline stage using the Docker image

## Non-goals (v1)

- **Not a replacement for manual Trusted-Tester review.** Automated checks are a first-pass signal, not a compliance determination.
- **Not a generic a11y engine.** The tool's value is alignment with ANDI's exact alert set. axe-core is available as an optional second layer (`--with-axe`) for breadth.
- **No authenticated or SPA-session crawling in v1.** Targets that require login or defend against automation beyond CSP headers are out of scope.

## Provenance and license

This repository is a fork of [SSAgov/ANDI](https://github.com/SSAgov/ANDI). The `andi/` directory is the upstream vendored tree, kept byte-for-byte unmodified so `git merge upstream` is conflict-free. All wrapper code is original.

**License:** Apache-2.0 for the entire repository. The `NOTICE` file carries the U.S. Social Security Administration attribution required by the Apache license.

See `docs/ARCHITECTURE.md` for full decision records, `docs/PLAN.md` for the phased roadmap, and `docs/research-thread.md` for the research origin.
