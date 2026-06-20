---
project: ANDI-CLI
ai_memory_project: andi-cli
ai_memory_project_id: f20e89c4-1493-433a-bd53-5a5e24e0c52a
front_desk: /Users/jarvis_arunlab/code/research-lab
research_lab_page: /Users/jarvis_arunlab/code/research-lab/20_RESEARCH/2026-06-17__engineering__automated-508-compliance-andi-cli.md
github: https://github.com/arunsanna/andi-cli
---

# ANDI-CLI — Agent Context

Headless CLI + CI wrapper for the U.S. SSA **ANDI** (Accessible Name & Description Inspector) Section 508 accessibility tool. ANDI ships only as a manual browser bookmarklet; this project drives the official `andi.js` in headless Chromium and emits structured, CI-gateable results.

## Source of truth

- **Mutable status / tasks:** AI Memory project `andi-cli` (`task_list(project='andi-cli')`).
- **Front-desk registry:** `/Users/jarvis_arunlab/code/research-lab/50_PROJECTS/PROJECTS.md`.
- **Research thread:** `docs/research-thread.md` (origin) and the research-lab note above.
- **Architecture / decisions:** `docs/ARCHITECTURE.md`. **Build plan:** `docs/PLAN.md`.

## Orient first

1. Read `docs/ARCHITECTURE.md` (feasibility is proven; ANDI runs headless) and `docs/PLAN.md` (phased roadmap).
2. Check the `andi-cli` AI Memory board for the task in progress.
3. Run `npm run test:fixture` to see the tool working before changing it.

## What works today (v0.1)

`node src/cli.cjs --url <url>` scans the **focusable module** and emits a report or JSON with grouped alerts (severity), the flagged DOM elements, and a CI exit code (`--fail-on`). Validated headless against `examples/fixture.html` and live URLs.

## Build rules

- Host-based Node project (not Docker); host `npm` is fine here.
- Keep the official `andi.js` **unmodified** — wrap, don't fork. Trusted-Tester alignment is the whole point.
- DOM/JS selectors for ANDI v29 are documented in `docs/ARCHITECTURE.md`; update that table if SSA changes ANDI.
- Verify every change with `npm run test:fixture` and confirm exit codes.
- Playwright is pinned to `1.55.0` to match the cached Chromium build (1187).

## Next actionable work

See `docs/PLAN.md` Phase 2: reliable multi-module aggregation, unit tests, and internal-object fallback. Don't start broad refactors; ship the smallest phase slice.
