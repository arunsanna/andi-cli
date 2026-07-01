# andi-cli v1.0 Implementation Plan

> **Status note (2026-06-30):** This file is the historical phased build plan and task
> contract. The current repo has implemented Phases 0-3 plus the launch-readiness gate:
> multi-module ANDI scans, DOM-primary extraction, JSON/SARIF/JUnit/HTML reports,
> sitemap/URL-list scanning, the optional `--with-axe` engine, Docker, GitHub Actions,
> selector-contract tests, parity/benchmark harnesses, and launch docs. Use
> `README.md`, `docs/ARCHITECTURE.md`, `package.json`, and the AI Memory board for
> current execution status.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax. Mutable status lives in AI Memory project **`andi-cli`**
> (epics AC-001…AC-005).

**Goal:** Ship a reproducible, CI-native, Trusted-Tester-aligned Section 508 scanner that
drives the unmodified official ANDI headlessly, gates builds on findings, and emits
SARIF/JUnit/HTML — the automation US federal/508 teams do not have today.

**Architecture:** A literal fork of `SSAgov/ANDI` (Apache-2.0). Our code wraps the untouched
`andi/` tree: Playwright loads the target page in a `bypassCSP` context, request-routing
serves every ANDI asset from the local fork, ANDI runs, we extract findings from the **DOM**
(internal JS objects proved unreliable — Phase 0) using the **alerts-list count as the
assertion basis** with per-element enrichment, aggregate across modules in fresh page
contexts via `AndiModule.launchModule`, map alerts to WCAG, and render to multiple formats
with a CI exit code. axe-core is an optional `--with-axe` layer.

**Tech Stack:** Node ≥18 (CommonJS `.cjs`), Playwright `1.55.1` (Chromium build 1193),
`@axe-core/playwright` (optional dep), `node:test`, GitHub Actions, Docker.

## Current state (2026-06-30)

**Exists:** `src/cli.cjs`, `src/scanner.cjs`, fresh-context multi-module scanning,
DOM-primary extraction, aggregation, WCAG mapping, text/JSON/SARIF/JUnit/HTML reporters,
sitemap/URL-list scanning, optional axe integration, parity and benchmark harnesses, Docker,
GitHub composite action, CI self-tests, per-module fixtures, selector-contract tests, and
launch/security/contribution docs. Playwright `1.55.1` is installed and matched to Chromium
build 1193.

**Proven (Phase 0 grounding, committed 2026-06-20):** hermetic run = 0 external requests +
parity (`spikes/04`); `AndiModule.launchModule` drives modules; DOM-primary extraction
(`spikes/05`); the fork carries every ANDI asset; ANDI = Apache-2.0.

**Historical plan caveat:** the unchecked task lists below were written before the fork and
before implementation. They remain useful as the original acceptance contract, but do not
represent open work by checkbox state. Mutable open work lives in the AI Memory project
`andi-cli`, currently under AC-005 launch readiness.

> The grounding spikes (`04`,`05`) run against a `SSAgov/ANDI` clone via the `ANDI_DIR` env;
> once the fork lands they resolve to `./andi`. Task 0.2 is their in-repo promotion.

## Global Constraints

_Every task implicitly includes these. Verbatim, non-negotiable._

- **Never modify `andi/`** — upstream tree, kept byte-for-byte so `git merge upstream` is
  conflict-free. Our code lives in `src/`, `test/`, `.github/`, `docs/`, `examples/`.
- **Node ≥18; Playwright pinned `1.55.1`** (Chromium build 1193). Do not bump.
- **CommonJS `.cjs`**. No ESM, no TypeScript in v1.
- **License: Apache-2.0** for the whole fork. `NOTICE` carries SSA attribution. No `Claude`
  co-authorship in any commit or file.
- **Hermetic + CSP:** every scan context is `browser.newContext({ bypassCSP: true })` (so
  CSP-protected `.gov` targets can't block injection); routing aborts+records all externals;
  `--strict-offline` fails the run if any external was attempted.
- **Count basis (AMENDED — Phase 1 grounding, `spikes/06`):** assertions use the **per-module
  alerts-list count** (`#ANDI508-alerts-list` = `testPageData.numberOfAccessibilityAlertsFound`,
  surfaced as `andiAlertTotal`) — the only signal that exists for `s/h/i`. Per-element flags
  (`.ANDI508-element-*`, `f/c/t/g/l` only) **enrich** a finding's `element`; not the basis
  (Decision 4).
- **Honesty banner** on every human-facing report: _"Automated checks cover a subset of
  Section 508; ANDI surfaces items for human Trusted-Tester judgment."_
- **Verify every change:** `npm test` green AND `npm run test:fixture` exit code as expected.
- Conventional commits, present tense, ≤72-char subject.

## File Structure

```
andi/                          # UPSTREAM (fork) — never modify
src/
  cli.cjs                      # MODIFY — arg parsing, output dispatch, exit code
  scanner.cjs                  # MODIFY — orchestrates one scan (bypassCSP ctx → route → inject → run → extract)
  vendor-route.cjs             # CREATE — hermetic request routing (serve andi/ locally)
  extract.cjs                  # CREATE — DOM-primary extraction → Finding[]
  modules.cjs                  # CREATE — per-module scanning via AndiModule.launchModule
  aggregate.cjs                # CREATE — merge findings across modules/engines, de-dup
  wcag-map.cjs                 # CREATE — ANDI alert → {ruleId, wcag[]} (best-effort)
  engines/axe.cjs              # CREATE — optional @axe-core/playwright adapter
  report/{text,json,sarif,junit,html}.cjs   # CREATE — reporters
  sitemap.cjs                  # CREATE — multi-URL / sitemap.xml crawl
  vendor/jquery-3.7.1.min.js   # CREATE — pinned jQuery
test/
  fixtures/                    # CREATE — per-module + csp + sitemap fixtures
  *.test.cjs                   # CREATE — unit/integration/contract tests
.github/{actions/andi-scan/action.yml, workflows/{selftest,release}.yml}   # CREATE
Dockerfile  NOTICE  CONTRIBUTING.md  SECURITY.md                            # CREATE
docs/ci/{github,gitlab,jenkins}.md  docs/sync-upstream.md  docs/output-schema.md  # CREATE
spikes/04-hermetic-vendor.cjs  spikes/05-extraction-source.cjs              # EXIST
```

---

# Phase 0 — De-risk & fork setup

### Phase Contract

**Entry**

- **Intent & expectations:** prove the compliance-grade premise is real before building — a fork that runs ANDI fully offline with identical output. "Good" = we _show_ hermeticity + parity, not assert them.
- **Goal & success metric:** baseline = "no fork; hermeticity unproven; MIT scaffold" → target = "fork established (`andi/` present, Apache-2.0); `spikes/04` prints `HERMETIC + PARITY OK`, exit 0".
- **Eval design (test-first):** `node spikes/04-hermetic-vendor.cjs` → 0 blocked external (excl. fixture img) AND alerts=2; `grep andiVersionNumber andi/andi.js`=29.2.2; `git merge upstream/master` dry-run conflict-free.
- **Scope:** in = fork, LICENSE/NOTICE, jQuery pin, in-repo hermetic proof. out = any `src/` feature work.
- **Grounding gate:** hermetic + `launchModule` + DOM-primary already proven (`spikes/04`,`05`). Remaining: re-confirm against the in-repo `andi/` post-fork. STOP if the in-repo spike regresses.
- **Readiness:** GitHub fork done (user action) → `andi/` present; Playwright 1.55 installed (✓).
- **Risks & mitigations:** SSA repo unavailable → cached clone; fork licensing → Apache-2.0 verified (owner: Arun).
- **Sizing & owner:** ~0.5 d · Arun · **reversibility: the fork/rename is irreversible → approval-gated.**

**Exit**

- **Run the evals:** V1 (hermetic), V2 (parity), V11 (version) green.
- **BASSPC self-review** (`self-review` skill) on the spike + skeleton — esp. A (assumptions), P (cleanup).
- **Definition of Done:** spike green · LICENSE/NOTICE committed · `package.json` test script · board updated · evidence attached.
- **Goal achieved? + path:** yes → Phase 1. no → revise routing/vendoring (iterate); if hermeticity proves impossible → escalate (reconsider the offline claim).
- **Improvement + learnings → memory:** record any new ANDI-load surprise vs. the network probe.

## Task 0.1 — Establish the fork and repo skeleton

**Files:** `LICENSE` (→ Apache-2.0), `NOTICE`, `andi/` (from upstream), `package.json`,
`.gitattributes`.

> **External action (user/gh):** fork `SSAgov/ANDI`, rename to `andi-cli`, then locally
> `git remote add upstream https://github.com/SSAgov/ANDI` and merge so `andi/` exists. Or, to
> keep the current repo: `git merge --allow-unrelated-histories upstream/master`.

- [ ] **Step 1:** `grep andiVersionNumber andi/andi.js` → `"29.2.2"`.
- [ ] **Step 2:** Replace `LICENSE` with `andi/LICENSE.md`'s Apache-2.0 text; create `NOTICE`:

```
andi-cli bundles the SSA ANDI tool (directory andi/), unmodified.
ANDI — Accessible Name & Description Inspector
Copyright: U.S. Social Security Administration · Source: https://github.com/SSAgov/ANDI
License: Apache License, Version 2.0 (see LICENSE). The wrapper code (src/, etc.) is also Apache-2.0.
```

- [ ] **Step 3:** `package.json`: `"license":"Apache-2.0"`, `"test":"node --test test/"`, add
      `"@axe-core/playwright"` to `optionalDependencies`. Keep `"playwright":"1.55.1"`.
- [ ] **Step 4:** `.gitattributes`: `andi/** linguist-vendored`.
- [ ] **Step 5: Commit** `chore: fork SSAgov/ANDI, relicense wrapper Apache-2.0, add NOTICE`.

**Validation:** `git merge upstream/master` dry-run is conflict-free; `andi/andi.js` present.

## Task 0.2 — Promote the hermetic spike in-repo (grounding already proven)

The mechanism is proven (`spikes/04`,`05`, committed). This task only re-points the proof at
the now-present `andi/` and pins jQuery.

- [ ] **Step 1:** Download `https://code.jquery.com/jquery-3.7.1.min.js` →
      `src/vendor/jquery-3.7.1.min.js` (commit).
- [ ] **Step 2:** Run `node spikes/04-hermetic-vendor.cjs` (defaults resolve to `./andi`).
      Expected: `G1 hermetic+parity: alerts=2 | blocked external=0`, `DONE`, exit 0.
- [ ] **Step 3: Commit** `test: pin jQuery; in-repo hermetic proof`.

**Validation (stop-gate):** zero blocked external requests beyond the fixture's broken image;
2 alerts. If it fails, stop and revise routing before Phase 1.

---

# Phase 1 — Compliance-grade core

### Phase Contract

**Entry**

- **Intent & expectations:** turn the v0.1 focusable-only scraper into a reliable multi-module gate. "Good" = deterministic findings across all modules, hermetic, with a trustworthy exit code.
- **Goal & success metric:** baseline = "1 module, flaky on switch, live ssa.gov dep, 0 tests" → target = "8 modules, **5/5 deterministic runs, 0 external requests**, exit-code matrix green, 9 fixtures pass, alerts-list-count basis (per-element enrichment for f/c/t/g/l)".
- **Eval design (test-first):** V1 (hermetic), V3 (per-module count/severity/element), V4 (exit-code matrix), V5 (5× determinism), V13 (CSP fixture); each impl is TDD (failing test first).
- **Scope:** in = vendor-route, ready signals, extraction, modules, aggregate, CLI, fixtures, wcag-map. out = reporters beyond text/json, sitemap, axe, Action.
- **Grounding gate — RESOLVED 2026-06-21 (`spikes/06`):** (a) `bypassCSP:true` injection on a real CSP-header page — **PROVEN** (no-bypass refused; bypass → findings, 0 external); (b) `s/h/i` launch + produce findings — **PROVEN but alerts-list-only** (zero per-element flags; `s` defaults to its headings sub-mode). Extraction amended to alerts-list-primary (Decision 4, Task 1.3).
- **Readiness:** Phase 0 green (`andi/`, jQuery vendored, `test/` scaffold, `npm test` wired).
- **Risks & mitigations:** `s/h/i` quirks (spike first); analysis-complete signal flaky (stability-poll + settle, hardened in 1.2); CSP edge cases (V13) — owner Arun.
- **Sizing & owner:** ~3–4 d · Arun.

**Exit**

- **Run the evals:** V1, V3, V4, V5, V13 green.
- **BASSPC self-review** — esp. B (bloat across the 6 new `src/` modules — shared helpers, not copies), S (scope), C (CLI I/O modes).
- **Definition of Done:** `npm test` green · README usage updated · committed · board (AC-001/002) updated · test-output evidence attached.
- **Goal achieved? + path:** yes → Phase 2. no → flaky module → iterate the signal; un-fixable module → document as known-limitation (**descope**, don't block); regression in hermeticity → rollback.
- **Improvement + learnings → memory:** modules 1→8, flaky→deterministic, networked→hermetic, tests 0→~15.

## Task 1.1 — `vendor-route.cjs`: hermetic routing (reusable)

**Files:** Create `src/vendor-route.cjs`; Test `test/vendor-route.test.cjs`.
**Produces:** `installVendorRoutes(page) → Promise<{ externalAttempts: string[] }>`.

- [ ] Test: `newContext({ bypassCSP: true })`, page, `installVendorRoutes`, goto focusable
      fixture, inject jQuery + `andi/andi.js`, wait ready, assert `externalAttempts` (excl.
      fixture img) empty and per-element danger count === 2.
- [ ] Run → FAIL. Implement (promote the spike's single dispatching route into a function;
      export `installVendorRoutes`, `ANDI_DIR`, `JQUERY`):

```js
"use strict";
const fs = require("fs"),
  path = require("path");
const ANDI_DIR = path.resolve(__dirname, "..", "andi");
const JQUERY = path.resolve(__dirname, "vendor", "jquery-3.7.1.min.js");
const CT = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".cur": "image/x-icon",
};
async function installVendorRoutes(page) {
  const externalAttempts = [];
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
    const m = u.match(/\/accessibility\/andi\/([^?]+)/);
    if (m) {
      const f = path.join(ANDI_DIR, m[1]);
      if (f.startsWith(ANDI_DIR) && fs.existsSync(f))
        return route.fulfill({
          status: 200,
          contentType: CT[path.extname(f)] || "application/octet-stream",
          body: fs.readFileSync(f),
        });
      externalAttempts.push("MISSING " + u);
      return route.fulfill({ status: 404, body: "" });
    }
    if (/\/jquery[.-]/i.test(u))
      return route.fulfill({
        status: 200,
        contentType: CT[".js"],
        body: fs.readFileSync(JQUERY),
      });
    externalAttempts.push(u);
    return route.abort("blockedbyclient");
  });
  return { externalAttempts };
}
module.exports = { installVendorRoutes, ANDI_DIR, JQUERY };
```

- [ ] Run → PASS. **Commit** `feat: hermetic vendor routing`.

## Task 1.2 — Deterministic ready + module-stable signals

**Files:** Modify `src/scanner.cjs`; Test `test/ready-signal.test.cjs`.
**Produces:** `waitAndiReady(page, timeout)` and `waitModuleStable(page, timeout)`. The
scanner creates contexts with `bypassCSP: true`. Replace all `waitForTimeout`. `waitModuleStable`
polls until the alerts list + total are stable across 3 × 250ms polls (see `spikes/04`).

- [ ] Steps: failing test (a scan completes with no fixed sleeps, 2 danger findings) → FAIL →
      implement → PASS → commit `feat: deterministic ANDI ready signals`.

## Task 1.3 — `extract.cjs`: DOM-primary extraction → `Finding[]`

**Files:** Create `src/extract.cjs`; Test `test/extract.test.cjs`.
**Produces:** `extractFindings()` (in-page via `page.evaluate`) → `Finding[]`. **Read the DOM
(grounded by `spikes/05`): `window.andiAlerter` is a transient buffer ANDI empties; do NOT
use it.** **Alerts-list-primary (grounded by `spikes/06`):** iterate `#ANDI508-alerts-list`
groups (each "_{Category}: ({n}) {message}_") → one `Finding` per occurrence; `severity` from
the alert group's category/class; `message` from the group text; `andiAlertTotal` ←
`testPageData.numberOfAccessibilityAlertsFound`. **Enrich:** when a matching
`.ANDI508-element-{danger,warning,caution}` highlight exists (`f/c/t/g/l` only), attach it as
`element` (`tag`, `html`, `andiIndex`, `selector` best-effort); otherwise `element: null`
(page-level alerts — `s/h/i`). **The per-module alerts-list count is the assertion basis**
(per-element is enrichment). Each finding: `engine:'andi'`, current `module`, `severity`,
`rule`+`wcag` (via `mapAlert`, Task 1.8), `message`, `element|null`.

- [ ] Steps: failing test (2 `danger` findings for `focusable.html`, each with `engine:'andi'`,
      `module:'focusable'`, non-empty `element.html`) → FAIL → implement → PASS → commit
      `feat: DOM-primary ANDI extraction`.

## Task 1.4 — `modules.cjs`: per-module scanning via `launchModule`

**Files:** Create `src/modules.cjs`; Modify `src/scanner.cjs`; Test `test/modules.test.cjs`.
**Consumes:** `installVendorRoutes`, `waitAndiReady`, `waitModuleStable`, `extractFindings`.
**Produces:** `MODULES` registry and `scanModule(browser, url, key, opts) → Finding[]` — fresh
`bypassCSP` page, route, inject, `launchModule(key)`, wait stable, extract, close.

- [ ] **Grounded mechanism (`spikes/04`):** `page.evaluate((m)=>window.AndiModule.launchModule(m), key)`
      after `waitAndiReady` — proven across `f/c/t/g/l`. One fresh page per module; never menu-click.
- [ ] Steps: failing tests — `scanModule(.., 'c')` on `contrast.html` returns the low-contrast
      finding; `scanModule(.., 't')` on `tables.html` returns the headerless table → FAIL →
      implement → PASS → commit `feat: reliable per-module scanning`.

**Acceptance (closes AC-001):** contrast/tables fixtures flag their planted violation,
deterministic across 5 runs (DOM count basis).

## Task 1.5 — `aggregate.cjs`: merge across modules/engines

**Files:** Create `src/aggregate.cjs`; Test `test/aggregate.test.cjs`.
**Produces:** `aggregate(findingArrays) → { findings, counts:{danger,warning,caution,info},
worst }`. Signature `sig(f) = \`${f.module||'_'}|${f.rule}|${f.element.selector||f.element.html}\``.
**Within the same engine**, drop exact-`sig`duplicates. **Across engines** (ANDI vs axe) that
collide on the same element but differ by rule: **keep both**, and tag the ANDI finding`alsoFoundBy:['axe']` for context — never silently drop a cross-engine finding. Sort by
severity rank then module.

- [ ] Steps: failing test (two module arrays + one intra-engine dup → correct merged count and
      `worst`; an axe+andi element collision keeps both) → FAIL → implement → PASS → commit
      `feat: finding aggregation`.

## Task 1.6 — CLI: `--module all`, output dispatch, exit-code contract

**Files:** Modify `src/cli.cjs`, `src/scanner.cjs`; Create `src/report/{text,json}.cjs`;
Test `test/cli.test.cjs`. `--module` accepts a key or `all` (default `f`). `scan()` runs the
modules via `scanModule`, aggregates, returns aggregate + metadata. `cli.cjs` dispatches to
reporters and exits per `--fail-on` on the **aggregate worst severity** (0 clean / 1 ≥
threshold / 2 error). Move the human report to `report/text.cjs` + honesty banner.
**Implement `--strict-offline`:** add it to the arg parser; after the scan, if any context's
`externalAttempts` is non-empty, print the offending URLs and exit `2` (overrides a clean gate).

- [ ] Steps: failing tests for the exit-code matrix (Validation V4) **and `--strict-offline`
      (V14)** → FAIL → implement → PASS → commit `feat: multi-module CLI + exit codes + strict-offline`.

## Task 1.7 — Per-module + CSP fixtures + integration suite (closes AC-002)

**Files:** Create `test/fixtures/{focusable,contrast,tables,structures,graphics,links,hidden,iframes,csp}.html`,
`test/scan.integration.test.cjs`. Each fixture has one planted, documented violation. **For
`f/c/t/g/l`** assert severity + offender `element`. **For `s/h/i` (grounded `spikes/06` — no
per-element flags)** assert the **alerts-list message + count** with `element: null`:
`structures` → `<div role="heading">` w/o `aria-level` (caution; `s` default mode = headings);
`hidden` → CSS `::before` content injection (warning); `iframes` → untitled `<iframe>` ("Iframe
has no accessible name or [title]" → danger, maps `iframe-no-title`). `csp.html` adds a
restrictive CSP (`spikes/06` proved bypass via a CSP **response header**; a `<meta
http-equiv="Content-Security-Policy" content="script-src 'self'">` fixture exercises the same
inline-injection block) plus a planted violation — proves `bypassCSP` lets injection succeed
where CSP would otherwise block.

- [ ] Steps: build the 9 fixtures → integration test asserts per-module alerts-list count + severity (+ `element` for `f/c/t/g/l`, `element:null` for `s/h/i`) + exit code under `--fail-on danger`, and that the CSP fixture still yields findings →
      `npm test` green → commit `test: per-module + CSP fixtures + integration suite`.

## Task 1.8 — `wcag-map.cjs`: ANDI alert → WCAG (best-effort)

**Files:** Create `src/wcag-map.cjs`; Test `test/wcag-map.test.cjs`.
**Produces:** `mapAlert(message) → { ruleId, wcag:string[] } | null` (null → `wcag:null` +
generic ANDI helpUri). Honest partial coverage; extend as modules land.

```js
"use strict";
const TABLE = [
  {
    re: /no accessible name|innertext, or \[title\]/,
    ruleId: "no-accessible-name",
    wcag: ["4.1.2"],
  },
  {
    re: /image .*(no alt|no accessible name)/,
    ruleId: "image-no-name",
    wcag: ["1.1.1"],
  },
  { re: /contrast/, ruleId: "low-contrast", wcag: ["1.4.3"] },
  {
    re: /table.*(header|<th>|caption)/,
    ruleId: "table-no-headers",
    wcag: ["1.3.1"],
  },
  { re: /heading/, ruleId: "heading-structure", wcag: ["1.3.1", "2.4.6"] },
  {
    re: /iframe.*title|title.*iframe/,
    ruleId: "iframe-no-title",
    wcag: ["4.1.2", "2.4.1"],
  },
  { re: /duplicate id/, ruleId: "duplicate-id", wcag: ["4.1.1"] },
];
function mapAlert(message) {
  const m = String(message || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  for (const row of TABLE)
    if (row.re.test(m)) return { ruleId: row.ruleId, wcag: row.wcag };
  return null;
}
module.exports = { mapAlert, TABLE };
```

- [ ] Steps: failing test (`mapAlert('Button has no accessible name...')` →
      `{ruleId:'no-accessible-name', wcag:['4.1.2']}`; unknown → null) → FAIL → implement →
      PASS → commit `feat: ANDI→WCAG mapping (best-effort)`.

---

# Phase 2 — Reporting & CI

### Phase Contract

**Entry**

- **Intent & expectations:** make the gate a real CI product — findings land where developers act (inline PR, dashboards, shareable report). "Good" = SARIF renders inline on a real PR.
- **Goal & success metric:** baseline = "text/json + exit code" → target = "SARIF 2.1.0 (schema-valid) + JUnit (parses) + HTML + sitemap aggregation + GitHub Action uploading SARIF + green self-test workflow".
- **Eval design (test-first):** V6 (SARIF schema), V7 (JUnit parse), V9 (sitemap), V10 (self-test dogfood), V14 (strict-offline); MV2 (real-PR inline annotation).
- **Scope:** in = 5 reporters + sitemap + Action + Docker + CI snippets. out = axe, launch docs.
- **Grounding gate:** spike SARIF ingestion on a throwaway repo (does GitHub render _our_ SARIF inline?) **before** wiring the Action — MV2 is the load-bearing assumption here.
- **Readiness:** Phase 1 green (`Finding[]` + aggregate + exit contract stable).
- **Risks & mitigations:** SARIF schema drift (vendor schema + ajv); WCAG-mapping coverage gaps (best-effort, documented) — owner Arun.
- **Sizing & owner:** ~5–7 d (long poles: SARIF, sitemap) · Arun.

**Exit**

- **Run the evals:** V6, V7, V9, V10, V14 + MV2.
- **BASSPC self-review** — esp. B across 5 reporters (shared helpers, not 5 copies) and the Harness add-on for the Action.
- **Definition of Done:** tests green · `docs/ci` + `output-schema` written · committed · board (AC-003) · evidence.
- **Goal achieved? + path:** yes → Phase 3. no → ship the formats that pass; a failing format → **descope** to a later release (don't block CI value).
- **Improvement + learnings → memory:** formats 2→5; manual report → CI-native.

## Task 2.1 — JSON reporter + schema

**Files:** `src/report/json.cjs`, `docs/output-schema.md`, `test/report-json.test.cjs`.
Emit `{ tool, version, scannedAt, urls[], findings[], counts, worst, andiAlertTotal }`. Test:
round-trips the aggregate; matches documented keys. Commit `feat: json reporter + schema`.

## Task 2.2 — SARIF 2.1.0 reporter

**Files:** Create `src/report/sarif.cjs`; Test `test/report-sarif.test.cjs`. **Produces:**
`toSarif(result) → object`:

```js
"use strict";
const ANDI_HELP = "https://github.com/SSAgov/ANDI";
const LEVEL = {
  danger: "error",
  warning: "warning",
  caution: "note",
  info: "note",
};
function toSarif(result) {
  const rules = new Map(),
    results = [];
  for (const f of result.findings) {
    const ruleId = `${f.engine}/${f.rule}`;
    if (!rules.has(ruleId))
      rules.set(ruleId, {
        id: ruleId,
        name: f.rule,
        shortDescription: { text: String(f.message).slice(0, 120) },
        helpUri:
          f.engine === "axe"
            ? `https://dequeuniversity.com/rules/axe/4.10/${f.rule}`
            : ANDI_HELP,
        properties: f.wcag ? { tags: f.wcag.map((w) => `WCAG ${w}`) } : {},
      });
    results.push({
      ruleId,
      level: LEVEL[f.severity] || "note",
      message: { text: f.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: f.url || (result.urls && result.urls[0]) || "page",
            },
            region: { snippet: { text: f.element.html } },
          },
          logicalLocations: f.element.selector
            ? [{ fullyQualifiedName: f.element.selector }]
            : undefined,
        },
      ],
      properties: { engine: f.engine, module: f.module, wcag: f.wcag },
    });
  }
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "andi-cli",
            informationUri: "https://github.com/arunsanna/andi-cli",
            version: result.version || "1.0.0",
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };
}
module.exports = { toSarif };
```

- [ ] Steps: failing test (validate against the vendored SARIF 2.1.0 schema at
      `test/fixtures/sarif-2.1.0.schema.json` via `ajv`, plus assert required keys) → FAIL →
      implement → PASS → commit `feat: SARIF 2.1.0 reporter`.

## Task 2.3 — JUnit XML reporter

**Files:** Create `src/report/junit.cjs`; Test `test/report-junit.test.cjs`. **Produces:**
`toJunit(result, failOnRank)`:

```js
"use strict";
const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const RANK = { info: 0, caution: 1, warning: 2, danger: 3 };
function toJunit(result, failOnRank = 3) {
  const groups = new Map();
  for (const f of result.findings) {
    const k = `${f.url || (result.urls && result.urls[0]) || "page"}|${f.module || f.engine}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  let body = "",
    tests = 0,
    failures = 0;
  for (const [k, fs] of groups) {
    const [url, mod] = k.split("|");
    let cases = "";
    for (const f of fs) {
      tests++;
      const fail = (RANK[f.severity] || 0) >= failOnRank;
      if (fail) failures++;
      const name = esc(`${f.rule}: ${f.element.tag}`);
      cases += fail
        ? `    <testcase name="${name}" classname="${esc(mod)}"><failure message="${esc(f.message)}" type="${esc(f.severity)}">${esc(f.element.html)}</failure></testcase>\n`
        : `    <testcase name="${name}" classname="${esc(mod)}"/>\n`;
    }
    body += `  <testsuite name="${esc(url)} [${esc(mod)}]" tests="${fs.length}">\n${cases}  </testsuite>\n`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="andi-cli" tests="${tests}" failures="${failures}">\n${body}</testsuites>\n`;
}
module.exports = { toJunit };
```

- [ ] Steps: failing test (well-formed XML via a parse; failure count = findings ≥ threshold)
      → FAIL → implement → PASS → commit `feat: JUnit XML reporter`.

## Task 2.4 — HTML reporter

**Files:** Create `src/report/html.cjs`; Test `test/report-html.test.cjs`. One self-contained
HTML string (inline CSS, no framework): honesty banner, per-URL → per-module → per-severity
grouping, element snippets, counts, `andiAlertTotal`. Test: contains the banner + each
finding's message + parses. Commit `feat: HTML report`.

## Task 2.5 — Sitemap / multi-URL scanning

**Files:** Create `src/sitemap.cjs`; Modify `src/cli.cjs`; fixtures `test/fixtures/sitemap/*`;
Test `test/sitemap.test.cjs`. `--urls <file>` (newline list) and `--sitemap <url|file>` (parse
`<loc>`). Scan each URL (reuse `scan`), tag findings with `url`, aggregate into one report;
exit = worst across all. `--concurrency <n>` default 1. Commit `feat: sitemap + multi-URL`.

## Task 2.6 — Composite GitHub Action + SARIF upload

**Files:** `.github/actions/andi-scan/action.yml`; `docs/ci/github.md`. Inputs:
`url`/`urls`, `modules`, `fail-on`, `with-axe`, `sarif`, `html`. Runs the CLI, then uploads
SARIF via `github/codeql-action/upload-sarif`. Commit `feat: GitHub Action + SARIF upload`.

## Task 2.7 — Dockerfile + npx

**Files:** `Dockerfile` (`FROM mcr.microsoft.com/playwright:v1.55.1-noble`, copy repo, `npm ci
--omit=dev`, entrypoint `node src/cli.cjs`). Verify `npx andi-scan --help`. Test: `docker
build` succeeds; `--help` exit 0. Commit `feat: Docker image + npx`.

## Task 2.8 — CI self-test workflow (dogfood the gate)

**Files:** `.github/workflows/selftest.yml`: on push/PR (ubuntu-latest) → `npm ci` →
`npx playwright install --with-deps chromium` → `npm test` (includes the selector-contract
test, Task 4.2) → run `andi-scan` on a clean fixture (expect 0) and on a violation fixture
with `--fail-on danger` (expect step failure, asserted by an inverted check). Commit
`ci: self-test workflow`.

## Task 2.9 — GitLab/Jenkins snippets

**Files:** `docs/ci/{gitlab,jenkins}.md` — copy-paste stages using the Docker image + JUnit
artifact. Commit `docs: GitLab and Jenkins CI snippets`.

---

# Phase 3 — Optional axe-core layer (`--with-axe`)

### Phase Contract

**Entry**

- **Intent & expectations:** offer axe as an OPT-IN second layer without diluting the ANDI identity. "Good" = `--with-axe` adds labeled findings; default behavior is byte-for-byte unchanged.
- **Goal & success metric:** baseline = "ANDI-only" → target = "`--with-axe` merges engine-labeled axe findings, de-duped, on a clean DOM, default off".
- **Eval design (test-first):** V8 (axe layer: labeled, clean DOM, cross-engine kept) + a unit test for the WCAG transform (412→4.1.2, 1411→1.4.11).
- **Scope:** in = axe adapter + merge + flag. out = anything that changes the default path.
- **Grounding gate:** spike that `@axe-core/playwright` runs on a clean page under `bypassCSP` before wiring merge.
- **Readiness:** Phase 1 aggregate + Phase 2 reporters present (engine label flows through).
- **Risks & mitigations:** axe DOM-pollution if run on ANDI's page (run on its own clean page); de-dup fragility (the `sig()` rule) — owner Arun.
- **Sizing & owner:** ~1.5 d · Arun.

**Exit**

- **Run the evals:** V8 + the WCAG-transform test.
- **BASSPC self-review** — esp. S (scope: default path must be untouched), A (assumptions about axe tag formats).
- **Definition of Done:** tests green · help/docs updated · committed · board (AC-004) · evidence.
- **Goal achieved? + path:** yes → Phase 4. no → keep axe behind the flag as experimental (**descope**), never block launch.
- **Improvement + learnings → memory:** engines 1→2 (opt-in).

## Task 3.1 — axe adapter on a clean page

**Files:** Create `src/engines/axe.cjs`; Test `test/axe.test.cjs`. **Produces:**
`runAxe(browser, url, opts) → Finding[]`:

```js
"use strict";
const IMPACT = {
  critical: "danger",
  serious: "warning",
  moderate: "caution",
  minor: "info",
};
async function runAxe(browser, url, opts = {}) {
  let AxeBuilder;
  try {
    ({ AxeBuilder } = require("@axe-core/playwright"));
  } catch {
    throw new Error("Install @axe-core/playwright to use --with-axe");
  }
  const ctx = await browser.newContext({ bypassCSP: true });
  const page = await ctx.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: opts.timeoutMs || 30000,
    });
    const res = await new AxeBuilder({ page }).analyze();
    return res.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        engine: "axe",
        module: null,
        severity: IMPACT[v.impact] || "info",
        rule: v.id,
        message: v.help,
        wcag: v.tags
          .filter((t) => /^wcag\d{3,4}$/.test(t)) // criterion codes only (wcag412, wcag1411); skip level tags (wcag2a)
          .map((t) => {
            const d = t.replace(/^wcag/, "");
            return [d[0], d[1], d.slice(2)].join("."); // 412→4.1.2, 1411→1.4.11
          }),
        element: {
          tag: (n.html.match(/^<(\w+)/) || [])[1] || "",
          html: n.html,
          selector: Array.isArray(n.target) ? n.target.join(" ") : null,
          andiIndex: null,
        },
      })),
    );
  } finally {
    await ctx.close();
  }
}
module.exports = { runAxe };
```

- [ ] Steps: failing test (axe on `focusable.html` finds empty button/link; none flag ANDI UI
      since ANDI isn't injected here) → FAIL → implement → PASS → commit `feat: optional axe engine`.

## Task 3.2 — Merge axe into the aggregate

**Files:** Modify `src/aggregate.cjs`, `src/scanner.cjs`; Test `test/axe-merge.test.cjs`.
When `--with-axe`, `runAxe` once per URL; feed into `aggregate` (cross-engine rule from Task
1.5: keep both, tag `alsoFoundBy`). Commit `feat: merge axe + ANDI findings`.

## Task 3.3 — `--with-axe` CLI wiring + reporter labels

**Files:** Modify `src/cli.cjs`, `src/report/*`; Test `test/with-axe-cli.test.cjs`. Flag
plumbs through; every reporter shows the `engine` label + `alsoFoundBy`. Commit `feat: --with-axe`.

---

# Phase 4 — Launch

### Phase Contract

**Entry**

- **Intent & expectations:** ship a credible, honest public v1 the federal/508 audience trusts. "Good" = provenance clear, coverage boundary honest, upstream-sync provable.
- **Goal & success metric:** baseline = "private, no launch docs" → target = "README/CONTRIBUTING/SECURITY + provenance + sync runbook + selector-contract test + `v1.0.0` tag (publish approval-gated)".
- **Eval design (test-first):** V11 (version), V15 (selector-contract), V12 (cross-platform CI); MV1 (live `.gov` Trusted-Tester parity).
- **Scope:** in = docs, sync runbook, version/selector tests, release workflow. out = new features.
- **Grounding gate:** no new mechanism to ground — but **run MV1 before publishing**.
- **Readiness:** Phases 1–3 green; npm name free (confirmed); Action validated (Phase 2).
- **Risks & mitigations:** ANDI trademark on naming (descriptive use; fallback name ready); SSA selector drift (V15) — owner Arun.
- **Sizing & owner:** ~1.5 d · Arun · **reversibility: publish is irreversible → approval-gated (Task 4.3).**

**Exit**

- **Run the evals:** V11, V12, V15 + MV1.
- **BASSPC self-review** on the docs — esp. A (over-claims), S (sycophancy: keep the honest coverage banner, don't oversell).
- **Definition of Done:** docs complete · tests green · tagged · **published only after explicit Arun approval** · board (AC-005) · evidence.
- **Goal achieved? + path:** yes → v1.0 shipped. no → hold launch, fix, re-eval (**never publish on red**).
- **Improvement + learnings → memory:** private → public OSS; capture the launch retro.

## Task 4.1 — README, CONTRIBUTING, SECURITY, provenance

Rewrite `README.md` (federal-508 positioning + automated/manual honesty + "forked from
SSAgov/ANDI" + Apache-2.0/NOTICE + quickstart). Add `CONTRIBUTING.md`, `SECURITY.md`. Commit
`docs: launch docs`.

## Task 4.2 — Upstream-sync runbook + version + selector-contract tests

**Files:** `docs/sync-upstream.md`; `test/version.test.cjs`; `test/selectors.contract.test.cjs`.
`version.test` asserts the scanner's `andiVersion` equals `grep andiVersionNumber andi/andi.js`.
**`selectors.contract.test` (Decision 9)** loads `andi/andi.js` headless and asserts the
load-bearing surface is intact: `#ANDI508`, `#ANDI508-alerts-list`, the ready signal shape,
`.ANDI508-element-*` produced on the multi fixture, and
`typeof window.AndiModule.launchModule === 'function'`. Both run in CI (Task 2.8) and are
mandatory after every `git merge upstream`. Document the fetch→merge→`npm test`→bump→tag flow.
Commit `test: version + selector-contract; docs: upstream-sync runbook`.

## Task 4.3 — Publish

`.github/workflows/release.yml` (npm publish on tag), publish `andi-cli`, list the Action,
tag `v1.0.0`. **Approval-gated — do not publish without Arun's go.** Commit `ci: release workflow`.

## Task 4.4 — "Why ANDI in CI" writeup

Short post framing the gap, the federal audience, and the honest coverage boundary. Commit
`docs: why ANDI in CI`.

---

# Validation Plan

Each layer is automated unless marked manual. The gate is green only when all pass.

| #   | Layer                      | Proves                                  | How                                                                                                                                                |
| --- | -------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | **Hermetic network**       | Zero egress                             | `test/vendor-route.test.cjs`: `externalAttempts` (excl. fixture img) empty                                                                         |
| V2  | **Vendor parity**          | Vendoring didn't change output          | Scan `fixture.html` vendored vs. live; identical alert set                                                                                         |
| V3  | **Per-module correctness** | Each module flags its violation         | `scan.integration.test.cjs` over 8 fixtures: **per-module alerts-list count** + severity (+ `element` for `f/c/t/g/l`; `element:null` for `s/h/i`) |
| V4  | **Exit-code matrix**       | Gate contract holds                     | `test/cli.test.cjs`: each `--fail-on` × fixture → 0/1/2 (table below)                                                                              |
| V5  | **Determinism**            | No flaky multi-module                   | Module `c`,`t` scans 5× in CI; identical findings                                                                                                  |
| V6  | **SARIF validity**         | GitHub code scanning ingests it         | `report-sarif.test.cjs`: validate against vendored SARIF 2.1.0 schema (ajv)                                                                        |
| V7  | **JUnit validity**         | CI dashboards parse it                  | Parse XML; failure count = findings ≥ threshold                                                                                                    |
| V8  | **axe layer**              | Merges, labels, clean DOM               | `--with-axe`: axe findings labeled; cross-engine collisions kept                                                                                   |
| V9  | **Sitemap aggregation**    | Multi-page rolls up + worst exit        | 2-page fixture sitemap → both present, exit = worst                                                                                                |
| V10 | **CI self-test (dogfood)** | The Action gates real builds            | `selftest.yml`: clean → green; violation + `--fail-on danger` → red                                                                                |
| V11 | **Version tracking**       | Releases track ANDI                     | `version.test.cjs` matches `andi/andi.js`                                                                                                          |
| V12 | **Cross-platform**         | Works on the real CI target             | `selftest.yml` on `ubuntu-latest` headless; macOS dev smoke                                                                                        |
| V13 | **CSP injection**          | Protected `.gov` targets still scan     | `csp.html` (restrictive CSP meta) yields findings under `bypassCSP`                                                                                |
| V14 | **`--strict-offline`**     | The offline flag actually fails loudly  | `test/strict-offline.test.cjs`: a route to a non-vendored asset → non-zero exit                                                                    |
| V15 | **Selector contract**      | Upstream merges can't silently break us | `selectors.contract.test.cjs`: load-bearing selectors + `launchModule` present after load                                                          |

### Exit-code matrix (V4)

| Fixture                      | `--fail-on danger` | `--fail-on warning` | `--fail-on caution` | `--fail-on none` |
| ---------------------------- | ------------------ | ------------------- | ------------------- | ---------------- |
| `focusable.html` (2 dangers) | 1                  | 1                   | 1                   | 0                |
| clean page (0 findings)      | 0                  | 0                   | 0                   | 0                |
| caution-only fixture         | 0                  | 0                   | 1                   | 0                |
| invalid URL (scan error)     | 2                  | 2                   | 2                   | 2                |

### Manual validation (human-in-the-loop)

- **MV1 — Trusted-Tester parity:** scan a live `.gov` page; open the HTML report; run the ANDI
  bookmarklet by hand on the same page. **Acceptance:** every danger/warning in the report
  appears in the manual ANDI run for the same module, and counts match within the
  alert-type-vs-element distinction (Decision 4). Record any divergence as a bug.
- **MV2 — PR annotations:** upload SARIF from a real PR. **Acceptance:** each finding renders
  **inline on the changed file in the PR diff** (Security-tab-only does not satisfy this gate —
  inline annotation is the advertised feature) with its rule id + WCAG tag.

---

# Sizing & critical path

Rough engineer-day estimates (assume the proven mechanisms hold; ANDI's untested `s/h/i`
modules are the main variance):

| Phase | Scope                                         | Est.                                         |
| ----- | --------------------------------------------- | -------------------------------------------- |
| 0     | fork + hermetic proof                         | ~0.5 d (grounding done; fork is user action) |
| 1     | hermetic multi-module core + WCAG map + tests | ~3–4 d                                       |
| 2     | 5 reporters + sitemap + Action + Docker + CI  | ~5–7 d                                       |
| 3     | optional axe layer                            | ~1.5 d                                       |
| 4     | docs + sync/contract tests + publish          | ~1.5 d                                       |

**~12–16 engineer-days** for feature-complete v1. **Critical path:** Phase 1
`extract → aggregate → cli` — every reporter and the gate depend on `Finding[]` + the
exit-code contract; nothing in Phase 2 can start before Task 1.6. **Long poles:** SARIF
rule/WCAG metadata (1.8 + 2.2) and sitemap (2.5). Phase 2 ≈ 2× Phase 1 — sequence reporters
by adoption value (SARIF → JUnit → HTML). **First useful milestone:** end of Phase 1 (a
reliable local multi-module gate); ship internally there before investing in Phase 2.

# Execution Sequence

`0.1 → 0.2` (stop-gate) → `1.1 → 1.2 → 1.3 → 1.8 → 1.4 → 1.5 → 1.6 → 1.7` → `2.1 → 2.2 → 2.3
→ 2.4 → 2.5 → 2.6 → 2.7 → 2.8 → 2.9` → `3.1 → 3.2 → 3.3` → `4.1 → 4.2 → 4.3 (approval) → 4.4`.

(1.8 WCAG-map moves before 1.4 so extraction can attach `wcag` from first scan.)

## Non-goals (v1)

- Reimplementing ANDI checks · beating axe at generic a11y · authenticated/SPA crawling ·
  targets that defend against automation beyond CSP · modifying `andi/` · a hosted SaaS.
