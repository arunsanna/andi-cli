# andi-cli — Build Plan

Phased roadmap. Each phase is independently shippable and written so an agent can execute it with no prior context. Mutable task state lives in AI Memory under project slug **`andi-cli`** — check there for current status before starting.

## Phase 1 — Feasibility spike ✅ DONE (2026-06-20)

Proved ANDI runs headless and yields scrapable 508 alerts. Artifacts in `spikes/`, decision in `docs/ARCHITECTURE.md`. Outcome: GO.

## Phase 2 — Core CLI (in progress)

**Goal:** `andi-scan --url <url>` produces a reliable structured 508 report for the focusable module.

- [x] Playwright scanner that injects `andi.js` and extracts grouped alerts + flagged elements (`src/scanner.cjs`).
- [x] CLI with text/JSON output and CI exit codes (`src/cli.cjs`).
- [x] Test fixture with deliberate violations (`examples/fixture.html`).
- [ ] **Reliable multi-module aggregation.** Make `--module` actually re-run and merge alerts across `f,g,l,t,s,c,h,i`. Investigate how ANDI repopulates `#ANDI508-alerts-list` on module switch (event vs. timing); wait on the alerts-list mutation, not a fixed delay. Acceptance: scanning `examples/fixture.html --module c` reports the low-contrast paragraph; `--module t` reports the headerless table.
- [ ] **Unit/integration tests** against the fixture (assert alert count, severity, exit code). Add `npm test`.
- [ ] **Hardening:** fall back to `window.andiAlerter`/`testPageData` when DOM scraping yields nothing; handle CSP-protected target pages (document the limitation + `--andi-src` self-host path).

## Phase 3 — Reporting & CI

**Goal:** drop-in CI gate with shareable reports.

- [ ] HTML report (`--html out.html`) — human-reviewable, grouped by severity + page.
- [ ] JUnit/XML output (`--junit out.xml`) for CI dashboards.
- [ ] Sitemap/multi-route scanning (`--sitemap` or `--urls file`) with an aggregate report stored as `508-REPORT.md`.
- [ ] Sample GitHub Action + GitLab CI templates in `.github/workflows/` and `docs/ci/`.
- [ ] Pin/self-host `andi.js` for reproducible runs.

## Phase 4 — Multi-layered audit + skill

**Goal:** maximum coverage and reuse.

- [ ] Integrate `axe-core` (`@axe-core/playwright`) as a fast second layer; merge with ANDI results, de-duplicated, labeled by engine. Axe for speed/coverage, ANDI for Trusted-Tester alignment.
- [ ] AI-assisted remediation: feed ANDI results + element screenshots to an LLM (via the Switchboard gateway, not a metered key) for fix suggestions, not just error lists.
- [ ] `skill-508-compliance` in the research-lab skills tree that wraps this CLI into a repeatable workflow + `508-REPORT.md` format in `60_OUTCOMES/`.

## Non-goals

- Reimplementing ANDI's checks (defeats Trusted-Tester alignment).
- Replacing axe-core/pa11y for generic a11y (ANDI alignment is the differentiator).

## Working rules for agents

- This is a host-based Node project (not Docker). `npm` on the host is fine here.
- Keep the official `andi.js` unmodified; wrap, don't fork.
- Verify every change by running `npm run test:fixture` and confirming exit codes.
- Update the AI Memory `andi-cli` board task you're working when you start/finish.
