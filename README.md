# andi-cli

**Headless CLI + CI wrapper for the U.S. SSA [ANDI](https://www.ssa.gov/accessibility/andi/help/install.html) (Accessible Name & Description Inspector) — the tool the federal Section 508 Trusted-Tester process is keyed to.**

This repository is forked from [SSAgov/ANDI](https://github.com/SSAgov/ANDI). The `andi/` directory is the unmodified upstream vendored tree. The wrapper code (`src/`, `test/`, `.github/`, `docs/`) drives that official ANDI in headless Chromium and emits structured, CI-gateable results.

> **Honest coverage boundary.** This CLI can match **ANDI alerts** on a rendered page. Automated checks cover a **subset** of Section 508. It does **not** replace human Trusted-Tester review and is **not** a compliance certification. A clean scan only means ANDI did not report findings at the chosen severity.

> Tracks ANDI v29.2.2. Not published on npm yet — install from this repo.

## Why ANDI in CI?

The U.S. federal Trusted-Tester process is keyed to ANDI's exact alert set — not generic engines like axe-core, pa11y, or Lighthouse. ANDI ships only as a manual browser bookmarklet. `andi-cli` drives the **unmodified official `andi.js`** in headless Chromium and emits that output in formats a CI system can gate on.

## Install (what works today)

Node 18+ and Playwright Chromium **1193** are required.

```bash
git clone https://github.com/arunsanna/andi-cli
cd andi-cli
npm install
npx playwright install chromium
```

Prove the install. The bundled fixture has deliberate violations, so the command **exits 1**:

```bash
npm run test:fixture
```

Then scan **rendered HTML**, not application source. For React, Vite, Astro, SvelteKit, or a static-exported Next.js app, build first, then point `--dir` at `dist/`, `build/`, `public/`, or `out/`:

```bash
node src/cli.cjs --dir /path/to/your-app/dist --module all --fail-on danger \
  --html /tmp/andi.html --sarif /tmp/andi.sarif
```

More copy-paste examples: [`docs/USAGE.md`](docs/USAGE.md). How it works: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Doc map: [`docs/README.md`](docs/README.md).

`npx andi-cli` and `ghcr.io/arunsanna/andi-cli` are the intended release targets. They are **not published**. Until they are, clone this repo. To try Docker from source:

```bash
docker build -t andi-cli .
docker run --rm -v "$PWD:/work" andi-cli --url file:///work/examples/fixture.html --fail-on none
```

Do not pass `andi-scan` as a Docker argument — the image entrypoint already is the CLI.

## Usage

Until the package is published, use `node src/cli.cjs` from this checkout (same flags as the future `andi-scan` command).

```bash
# Built site (every .html / .htm page, rendered in Chromium)
node src/cli.cjs --dir ./dist --module all --fail-on danger
node src/cli.cjs --dir ./dist --json --out andi.json --html andi.html

# One URL (default module is focusable; use --module all for every ANDI module)
node src/cli.cjs --url https://staging.example.com --module all --fail-on danger

# Several URLs, or a sitemap
node src/cli.cjs --urls urls.txt --module all --fail-on danger
node src/cli.cjs --sitemap https://example.com/sitemap.xml --concurrency 4

# Compare CLI alerts to ANDI (local oracle — expect 8/8 exact on the fixture)
node src/parity-cli.cjs --serve-file examples/fixture.html --module all \
  --browser-source local --fail-on-diff
```

`--dir` on a source tree with no `.html` files will not test your UI. Run `node src/cli.cjs --help` for the full flag reference.

## Flags

| Flag                    | Default  | Description                                                                                                                               |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--url <url>`           | _(none)_ | Page to scan (`http://`, `https://`, or `file://`). Required unless `--dir`, `--urls`, or `--sitemap` is given.                           |
| `--dir <directory>`     | _(none)_ | Serve a local directory on `127.0.0.1`, discover `.html`/`.htm` files recursively, render them in Chromium, and scan them.                |
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

ANDI is a government bookmarklet. This project opens the page in a hidden browser, runs that same official ANDI, reads the alerts ANDI shows, and writes a report a build can fail on. Details and decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## CI integrations

Snippets are in [`docs/ci/github.md`](docs/ci/github.md), [`docs/ci/gitlab.md`](docs/ci/gitlab.md), and [`docs/ci/jenkins.md`](docs/ci/jenkins.md).

**Known limits:** the GHCR image does not exist yet — build the `Dockerfile` yourself. The GitHub Action's `dir` input may look at this repo's checkout, not your app's `dist/` — prefer `url` against a staging page until that is fixed.

## Release targets

The intended release targets are the npm package `andi-cli` (exposing the
`andi-scan`, `andi-parity`, and `andi-benchmark` binaries), the GitHub composite
action at `.github/actions/andi-scan`, and the GHCR Docker image
`ghcr.io/arunsanna/andi-cli`. Publishing or tagging a release is approval-gated.

## Non-goals (v1)

- **Not a replacement for manual Trusted-Tester review.** Automated checks are a first-pass signal, not a compliance determination.
- **Not a generic a11y engine.** The tool's value is alignment with ANDI's exact alert set. axe-core is available as an optional second layer (`--with-axe`) for breadth.
- **No authenticated or SPA-session crawling in v1.** Targets that require login or defend against automation beyond CSP headers are out of scope.

## Provenance and license

This repository is a fork of [SSAgov/ANDI](https://github.com/SSAgov/ANDI). The `andi/` directory is the upstream vendored tree, kept byte-for-byte unmodified so `git merge upstream` is conflict-free. All wrapper code is original.

**License:** Apache-2.0 for the entire repository. The `NOTICE` file carries the U.S. Social Security Administration attribution required by the Apache license.

See [`docs/README.md`](docs/README.md) for the full doc map. Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Usage: [`docs/USAGE.md`](docs/USAGE.md). Launch leftovers: [`docs/ANDI-CI-LAUNCH-PLAN.md`](docs/ANDI-CI-LAUNCH-PLAN.md). `docs/PLAN.md` is the historical build contract — Phases 0–3 already shipped.
