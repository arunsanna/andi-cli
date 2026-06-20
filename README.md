# andi-cli

**Headless CLI + CI wrapper for the U.S. SSA [ANDI](https://www.ssa.gov/accessibility/andi/help/install.html) (Accessible Name & Description Inspector) Section 508 accessibility tool.**

ANDI is the de-facto tool the federal "Trusted Tester" 508 process is keyed to — but it ships **only as a manual browser bookmarklet**. There is no CLI, no CI integration, and no way to scan a whole site automatically. `andi-cli` closes that gap: it drives the _official, unmodified_ `andi.js` inside headless Chromium and emits structured results you can gate a build on.

> **Why ANDI and not just axe-core?** Mature engines (axe-core, pa11y, Lighthouse) already do automated a11y in CI. The unique value here is **alignment with ANDI's exact alerts**, which is what U.S. government 508 reviewers actually use. This wraps ANDI itself, so the output matches the human Trusted-Tester result.

## Status

**v0.1 — focusable-module scanning validated end-to-end, headless.** Feasibility is proven (see `docs/ARCHITECTURE.md` and `docs/spike-headless-proof.png`): ANDI v29.2.2 loads from the official SSA source, auto-launches in headless Chromium, and exposes both a scrapable alerts list and internal data objects (`window.andiAlerter`, `window.testPageData`).

Working today:

- `andi-scan --url <url>` → human report or JSON
- Page summary + grouped alerts with severity (danger/warning/caution)
- The actual flagged DOM elements
- CI-friendly exit codes (`--fail-on`)

Roadmap (see `docs/PLAN.md`): reliable multi-module aggregation (contrast, tables, structures), HTML + JUnit reports, sitemap crawling, an optional `axe-core` layer, and a `skill-508-compliance` wrapper.

## Install

```bash
npm install          # installs Playwright (browsers: npx playwright install chromium)
```

## Usage

```bash
# Human-readable report
node src/cli.cjs --url https://example.com

# JSON for pipelines
node src/cli.cjs --url https://staging.app --json --out report.json

# CI gate: non-zero exit when danger-level findings exist
node src/cli.cjs --url https://staging.app --fail-on danger

# Try it on the bundled fixture (deliberate violations)
npm run test:fixture
```

Run `node src/cli.cjs --help` for all options.

### Exit codes

| Code | Meaning                          |
| ---- | -------------------------------- |
| 0    | No findings at/above `--fail-on` |
| 1    | Findings at/above `--fail-on`    |
| 2    | Scan error                       |

## How it works

1. Load the target URL in headless Chromium (Playwright).
2. Inject the official `andi.js` — ANDI auto-launches and builds its analysis.
3. Read `#ANDI508-alerts-list` (grouped alerts), `#ANDI508-pageAnalysis` (summary), and the `ANDI508-element-*` flagged nodes; cross-check `window.testPageData`.

ANDI is **element-by-element by design**, unlike axe-core's one-shot `axe.run()`. See `docs/ARCHITECTURE.md`.

## Provenance

- Research thread: `docs/research-thread.md`
- Feasibility spikes: `spikes/01-feasibility.cjs`, `spikes/02-internals-probe.cjs`, `spikes/03-debug-dom.cjs`
- Headless proof: `docs/spike-headless-proof.png`

## License

MIT © 2026 Arun Sanna. ANDI itself is a U.S. SSA work; this project wraps the official tool without modifying it.
