# Architecture & Decision Record

> Status: validated by spike on 2026-06-20. Feasibility = **GO**.

## The problem

The SSA's **ANDI** is a manual JavaScript bookmarklet for Section 508 / WCAG inspection. It is what the federal Trusted-Tester process uses, but it requires a human to click element-by-element. No CLI, no CI, no site-wide reporting. `andi-cli` automates the official tool headlessly.

## Decision: wrap the official `andi.js` in headless Chromium

We inject the **unmodified** official `andi.js` from `https://www.ssa.gov/accessibility/andi/andi.js` into a Playwright-driven headless Chromium page. This keeps output aligned with the real ANDI Trusted-Tester result (the entire reason to use ANDI over axe-core/pa11y).

### Why not reimplement ANDI's checks?

Reimplementing would drift from ANDI's exact alerts and lose the Trusted-Tester alignment that is the project's whole value. Wrapping the official source guarantees parity and inherits SSA's updates.

### Why not just use axe-core?

axe-core/pa11y already have CLIs and are great for generic CI. They do **not** match ANDI's specific alert set. A future phase adds axe-core as a _second_ fast layer (`docs/PLAN.md` Phase 4), but ANDI is the differentiator.

## Spike findings (2026-06-20)

Validated with `spikes/01-feasibility.cjs`, `02-internals-probe.cjs`, `03-debug-dom.cjs`:

- **ANDI runs fully headless** (v29.2.2). Injecting `andi.js` auto-launches it — no `ANDI()` call needed. It builds its full ~62-element `ANDI508-*` UI with zero human interaction. Visual proof: `docs/spike-headless-proof.png`.
- **No module load failures.** The only failed request in the spike was a deliberately-broken fixture image.
- **Two extraction surfaces exist:**
  - **DOM (used by v1):** `#ANDI508-alerts-list` holds alerts grouped by type; group containers carry severity classes `ANDI508-display-danger` / `-warning` / `-caution`; individual items live in `.ANDI508-alertGroup-list > li`. Page summary is `#ANDI508-pageAnalysis`. The offending page nodes are tagged `ANDI508-element-danger` etc.
  - **Internal JS objects (for future hardening):** `window.andiAlerter.{dangers,warnings,cautions}` arrays and `window.testPageData.{numberOfAccessibilityAlertsFound,pageAlerts}`.
- **ANDI is element-by-element by design** — it has a "next element" model rather than one aggregate report like `axe.run()`. But it _does_ aggregate page alerts into `#ANDI508-alerts-list`, so v1 reads that list directly instead of stepping every element (faster and more reliable).

## Key DOM/JS reference (ANDI v29)

| What               | Where                                                               |
| ------------------ | ------------------------------------------------------------------- |
| Page summary       | `#ANDI508-pageAnalysis` (fallback `#ANDI508-additionalPageResults`) |
| Alerts list        | `#ANDI508-alerts-list`                                              |
| Alert group        | `.ANDI508-alertGroup-container` (+ `ANDI508-display-<severity>`)    |
| Group label        | `.ANDI508-alertGroup-toggler`                                       |
| Group items        | `.ANDI508-alertGroup-list > li`                                     |
| Flagged page nodes | `.ANDI508-element-danger` / `-warning` / `-caution`                 |
| Total alert count  | `window.testPageData.numberOfAccessibilityAlertsFound`              |
| Severity arrays    | `window.andiAlerter.{dangers,warnings,cautions}`                    |
| Module buttons     | `#ANDI508-moduleMenu-button-{f,g,l,t,s,c,h,i}`                      |
| Ready signal       | `window.andiVersionNumber` set AND `#ANDI508` present               |

## Known limitations (v1)

- **Only the focusable module is validated.** Switching modules (`--module c` etc.) currently updates the label but does not reliably repopulate the alerts list — reliable multi-module aggregation is Phase 2.
- **`file://` works**, but ANDI loads its modules from `ssa.gov`, so the scanner needs network access to the SSA host (or a self-hosted `--andi-src`).
- Single-page scans only; sitemap/route crawling is Phase 2.

## Pinning note

ANDI's behavior can change when SSA updates `andi.js`. For reproducible CI, host a pinned copy and pass `--andi-src`. Playwright is pinned to `1.55.0` to match the locally cached Chromium build (1187).
