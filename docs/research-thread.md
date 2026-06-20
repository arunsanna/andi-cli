# Automated 508 Compliance: ANDI-CLI Wrapper

**Tags**: #508-compliance #accessibility #automation #playwright #andi #engineering
**STATUS**: active
**created**: 2026-06-17
**updated**: 2026-06-20

## Spike Verdict (2026-06-20): GO — feasibility proven headless

Phase 1 de-risking spike succeeded. **ANDI v29.2.2 runs fully headless** via Playwright with zero human interaction and produces correct, scrapable Section 508 alerts.

- **Injection works**: load target page → `addScriptTag({url: 'https://www.ssa.gov/accessibility/andi/andi.js'})` → ANDI **auto-launches** (no `ANDI()` call needed) and builds its full 62-element `ANDI508-*` UI.
- **Real alerts produced**: on a fixture with an empty `<button>` and empty `<a>`, ANDI reported `Focusable Elements Found: 4, Accessibility Alerts: 2, Elements with No Accessible Name: (2)` and named each offending element. Visual proof: ANDI's Trusted-Tester toolbar rendered in the headless screenshot.
- **Better than DOM scraping**: ANDI exposes its results as live JS objects — `window.andiAlerter` (object) and `window.testPageData` (object). Read these directly for structured output instead of fragile DOM scraping.
- **No module failures**: the only 404 was the fixture's intentional broken image, not an ANDI asset.
- **Architecture correction**: ANDI is **element-by-element by design** (`ANDI508-button-nextElement`), unlike axe-core's one-shot `axe.run()`. The wrapper must drive ANDI's element iteration (or read `andiAlerter`/`testPageData`) and aggregate — that is the core engineering task.

Spike artifact: `/tmp/andi-spike/spike.cjs` (Playwright 1.55 + cached chromium-1187). To be promoted into the project repo.

## Context

The government team currently uses the **SSA ANDI (Accessible Name & Description Inspector)** tool for Section 508 compliance testing. ANDI is a manual JavaScript bookmarklet (favelet) designed for element-by-element inspection by a human "Trusted Tester."

### The Problem

- **Manual Overhead**: Requires a human to click through every page/element.
- **No CI/CD Integration**: Compliance is checked "at the end" rather than continuously.
- **Reporting Gaps**: No automated way to generate aggregate reports across a large site.
- **Dev Friction**: Developers have to manually run the bookmarklet; there is no CLI for local pre-commit checks.

## Proposed Solution: ANDI-CLI

We can transform the ANDI bookmarklet into an automated CLI and CI-ready tool by wrapping it in a headless browser (Playwright/Puppeteer).

### 1. Architecture

- **Engine**: Playwright (Headless Chromium).
- **Injection**: Load the target URL, then inject the official `andi.js` source.
- **Execution**: Trigger `ANDI_launch()` and wait for the `ANDI-dashboard` to populate in the DOM.
- **Extraction**: Scrape the `#ANDI-alerts-list` and related DOM elements to build a structured results object.

### 2. Capabilities

- **Automated Scanning**: Scan full sitemaps or specific routes automatically.
- **Report Generation**: Output results in JSON (for data analysis), HTML (for human review), and JUnit/XML (for CI dashboards).
- **Local Dev Tool**: A simple CLI command: `andi-scan --url http://localhost:3000`.

### 3. Implementation Plan (Spike)

- [x] **Phase 1: Extraction Logic**. Verify that we can reliably scrape ANDI alerts from a headless session. — DONE 2026-06-20 (see Spike Verdict above; read `andiAlerter`/`testPageData` rather than DOM).
- [ ] **Phase 2: CLI Wrapper**. Build a Node.js CLI that orchestrates the browser and outputs JSON.
- [ ] **Phase 3: CI Integration**. Create a sample GitHub Action/GitLab CI template.
- [ ] **Phase 4: Multi-Layered Audit**. Integrate `axe-core` alongside ANDI for maximum coverage (Axe for speed, ANDI for specific SSA alignment).

## How to Support This Idea

1. **Prototype a "Skill"**: We can create a `skill-508-compliance` that wraps this logic.
2. **Standardized 508 Workflow**: Define a `508-REPORT.md` format that gets auto-generated and stored in `60_OUTCOMES/`.
3. **AI-Assisted Verification**: Use LLMs (like Gemini) to analyze screenshots and ANDI results to provide "remediation advice" instead of just listing errors.

## Next Actions

- [x] Spike: Verify `andi.js` injection works in a local Playwright script. — DONE 2026-06-20, GO.
- [ ] Decide project home/scope (standalone `andi-cli` tool vs. client-attached vs. skill-only) — blocks repo + AI Memory project creation.
- [ ] Phase 2: build `andi-scan --url` Node CLI that reads `andiAlerter`/`testPageData` and emits JSON.
- [ ] Draft a proposed `skill-508-compliance` specification.
