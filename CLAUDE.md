---
project: ANDI-CLI
ai_memory_project: andi-cli
ai_memory_project_id: f20e89c4-1493-433a-bd53-5a5e24e0c52a
front_desk: /Users/jarvis_arunlab/code/research-lab
research_lab_page: /Users/jarvis_arunlab/code/research-lab/20_RESEARCH/2026-06-17__engineering__automated-508-compliance-andi-cli.md
github: https://github.com/arunsanna/andi-cli
---

# ANDI-CLI — Agent Context

Headless CLI + CI wrapper for the U.S. SSA **ANDI** (Accessible Name & Description Inspector). ANDI ships as a manual browser bookmarklet. This project drives the official unmodified `andi.js` in headless Chromium and emits structured, CI-gateable results.

The CLI can match ANDI's alert list on a rendered page. It does **not** replace human Trusted-Tester review and is not a Section 508 certification.

## Source of truth

- **Current usage:** `README.md` and `docs/USAGE.md`.
- **Architecture / decisions:** `docs/ARCHITECTURE.md`.
- **Doc map (what is current vs historical):** `docs/README.md`.
- **Open launch work:** `docs/ANDI-CI-LAUNCH-PLAN.md`.
- **Historical build contract:** `docs/PLAN.md` (Phases 0–3 are already implemented; do not treat unchecked boxes as open work).
- **Mutable task board:** AI Memory project `andi-cli`.
- **Front-desk registry:** `/Users/jarvis_arunlab/code/research-lab/50_PROJECTS/PROJECTS.md`.

## Orient first

1. Read `docs/README.md`, then `docs/ARCHITECTURE.md` and `docs/USAGE.md`.
2. Check `docs/ANDI-CI-LAUNCH-PLAN.md` for the next launch slice.
3. Run `npm run test:fixture` (expect exit 1 — the fixture has planted violations).

## What works today

Package version is still `0.1.0` and is **not published** on npm. From a local clone:

- Scan a URL, a URL list, a sitemap, or a local HTML tree (`--dir`).
- Run all 8 ANDI modules (`--module all`), default is focusable (`f`).
- Emit text, JSON, SARIF 2.1.0, JUnit, and HTML.
- Gate CI with `--fail-on` (exit 0 / 1 / 2).
- Optional `--with-axe` second engine.
- Compare CLI output to ANDI with `andi-parity`.
- Self-test and Docker-build GitHub workflows are green on `main`.

`--dir` scans **rendered** `.html` / `.htm` only. Build the app first, then scan `dist/`, `build/`, `public/`, or `out/`.

## Build rules

- Keep official `andi.js` **unmodified**. Wrap, do not edit `andi/`.
- CommonJS `.cjs`. Node ≥ 18. Playwright pinned to `1.55.1` (Chromium 1193).
- Extraction is DOM-primary (`#ANDI508-alerts-list`). Do not use `andiAlerter` internals.
- Verify changes with `npm test` and `npm run test:fixture`.
- Honesty banner on every human-facing report.

## Next actionable work

Launch leftovers in `docs/ANDI-CI-LAUNCH-PLAN.md`, in this order:

1. ~~Make `--dir` fail clearly when someone points it at source instead of a build.~~
2. ~~Close CLI vs bookmarklet gaps (fixture + section508.gov, 8/8 exact).~~
3. ~~Fix the GitHub Action / Docker consumer path.~~
4. **Stop for publish approval.** Do not publish npm, GHCR, or a tag without it.

Do not start new engines, auth/SPA crawling, or a refactor of `andi/`.
