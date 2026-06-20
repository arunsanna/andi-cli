# andi-cli v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking. Mutable status lives in AI Memory project
> **`andi-cli`** (epics AC-001…AC-005) — update the relevant task when you start/finish.

**Goal:** Ship a reproducible, CI-native, Trusted-Tester-aligned Section 508 scanner that
drives the unmodified official ANDI headlessly, gates builds on findings, and emits
SARIF/JUnit/HTML — the automation US federal/508 teams do not have today.

**Architecture:** A literal fork of `SSAgov/ANDI` (Apache-2.0). Our code wraps the untouched
`andi/` tree: Playwright loads the target page, request-routing serves every ANDI asset from
the local fork (hermetic — zero network), ANDI runs, we extract findings from ANDI's internal
JS objects (DOM fallback), aggregate across modules in fresh page contexts, and render to
multiple formats with a CI exit code. axe-core is an optional `--with-axe` second layer.

**Tech Stack:** Node ≥18 (CommonJS `.cjs`), Playwright `1.55.0` (cached Chromium 1187),
`@axe-core/playwright` (optional dep), `node:test` for tests, GitHub Actions, Docker.

## Global Constraints

_Every task implicitly includes these. Values are verbatim and non-negotiable._

- **Never modify `andi/`** — it is the upstream ANDI tree; keep it byte-for-byte so
  `git merge upstream` stays conflict-free. All our code lives in `src/`, `test/`,
  `.github/`, `docs/`, `examples/`.
- **Node ≥18; Playwright pinned `1.55.0`** (matches cached Chromium build 1187). Do not bump.
- **CommonJS `.cjs`** to match the existing scaffold. No ESM, no TypeScript in v1.
- **License: Apache-2.0** for the whole fork. `NOTICE` carries SSA attribution. No `Claude`
  co-authorship in any commit or file.
- **Hermetic:** a scan must make **zero external network requests**; any un-routed external
  request is blocked and recorded, and a `--strict-offline` run fails if the list is non-empty.
- **Honesty banner** on every human-facing report: _"Automated checks cover a subset of
  Section 508; ANDI surfaces items for human Trusted-Tester judgment."_
- **Verify every change:** `npm test` green AND `npm run test:fixture` exit code as expected.
- Conventional commits, present tense, ≤72-char subject.

## File Structure

```
andi/                          # UPSTREAM (fork) — never modify
src/
  cli.cjs                      # MODIFY — arg parsing, output dispatch, exit code
  scanner.cjs                  # MODIFY — orchestrates one scan (route → inject → run → extract)
  vendor-route.cjs             # CREATE — hermetic request routing (serve andi/ locally)
  extract.cjs                  # CREATE — hybrid extraction → Finding[] (internal objects + DOM)
  modules.cjs                  # CREATE — module registry + launch-into-module
  aggregate.cjs                # CREATE — merge findings across modules/engines, de-dup
  engines/
    axe.cjs                    # CREATE — optional @axe-core/playwright adapter
  report/
    text.cjs                   # CREATE — human report (moved from cli.cjs) + honesty banner
    json.cjs                   # CREATE — structured JSON
    sarif.cjs                  # CREATE — SARIF 2.1.0
    junit.cjs                  # CREATE — JUnit XML
    html.cjs                   # CREATE — static HTML report
  sitemap.cjs                  # CREATE — multi-URL / sitemap.xml crawl + aggregate
  vendor/
    jquery-3.7.1.min.js        # CREATE — pinned jQuery (kills googleapis fetch)
test/
  fixtures/                    # CREATE — per-module violation fixtures
    focusable.html  contrast.html  tables.html  structures.html
    graphics.html   links.html     hidden.html  iframes.html
    sitemap/ (page-a.html page-b.html sitemap.xml)
  *.test.cjs                   # CREATE — unit/integration tests
.github/
  actions/andi-scan/action.yml # CREATE — composite GitHub Action
  workflows/selftest.yml       # CREATE — CI self-test (dogfood the gate)
  workflows/release.yml        # CREATE — npm publish + tag
Dockerfile                     # CREATE
NOTICE                         # CREATE — SSA/ANDI Apache-2.0 attribution
CONTRIBUTING.md SECURITY.md    # CREATE
docs/ci/{gitlab,jenkins}.md    # CREATE — CI snippets
docs/sync-upstream.md          # CREATE — pull ANDI updates → release flow
spikes/04-hermetic-vendor.cjs  # CREATE — Phase 0 proof
```

---

# Phase 0 — De-risk & fork setup

## Task 0.1 — Establish the fork and repo skeleton

**Files:** repo root (LICENSE → Apache-2.0), `NOTICE` (create), `andi/` (from upstream),
`package.json` (modify), keep `src/`, `docs/`, `examples/`.

> **External action (user/gh):** on GitHub, fork `SSAgov/ANDI`, rename the fork to
> `andi-cli`, then locally `git remote add upstream https://github.com/SSAgov/ANDI` and merge
> its tree so `andi/` exists. If keeping the current `arunsanna/andi-cli` repo instead, add
> upstream and `git merge --allow-unrelated-histories upstream/master` to bring `andi/` in.

- [ ] **Step 1:** Confirm `andi/andi.js` exists and `window.andiVersionNumber` matches the
      vendored file: `grep andiVersionNumber andi/andi.js` → `"29.2.2"` (or current).
- [ ] **Step 2:** Replace `LICENSE` with the Apache-2.0 text from `andi/LICENSE.md`; create
      `NOTICE`:

```
andi-cli bundles the SSA ANDI tool (directory andi/), unmodified.
ANDI — Accessible Name & Description Inspector
Copyright: U.S. Social Security Administration
Source:   https://github.com/SSAgov/ANDI
License:  Apache License, Version 2.0 (see LICENSE)
The andi-cli wrapper code (src/, etc.) is also Apache-2.0.
```

- [ ] **Step 3:** Set `package.json`: `"license": "Apache-2.0"`, add `"test": "node --test test/"`,
      add `"@axe-core/playwright"` to `optionalDependencies`. Keep `"playwright": "1.55.0"`.
- [ ] **Step 4:** Add `.gitattributes` so `andi/**` is marked vendored (linguist-vendored)
      and excluded from our lint scope.
- [ ] **Step 5: Commit** `chore: fork SSAgov/ANDI, relicense wrapper Apache-2.0, add NOTICE`.

**Validation:** `git merge upstream/master` reports no conflicts in a dry run; `node -e "require('./package.json')"` parses; `andi/andi.js` present.

## Task 0.2 — Hermetic-vendor spike (the load-bearing proof)

**Files:** Create `spikes/04-hermetic-vendor.cjs`, `src/vendor/jquery-3.7.1.min.js`.

This proves the entire "compliance-grade" claim: ANDI runs with **zero** network egress and
yields the **same** findings as the live run.

- [ ] **Step 1:** Vendor jQuery: download `https://code.jquery.com/jquery-3.7.1.min.js` to
      `src/vendor/jquery-3.7.1.min.js` (commit it).
- [ ] **Step 2:** Write `spikes/04-hermetic-vendor.cjs`: load `examples/fixture.html`, install
      a single dispatching route (serve `andi/*` and jQuery locally, **abort+record** any other
      `http(s)` request), pre-inject jQuery, inject `andi/andi.js`, wait on the ready signal,
      read `window.testPageData.numberOfAccessibilityAlertsFound`.

```js
"use strict";
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const ANDI = path.resolve(__dirname, "..", "andi");
const JQ = path.resolve(
  __dirname,
  "..",
  "src",
  "vendor",
  "jquery-3.7.1.min.js",
);
const FIX =
  "file://" + path.resolve(__dirname, "..", "examples", "fixture.html");
const CT = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const external = [];
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
    const m = u.match(/\/accessibility\/andi\/(.+)$/);
    if (m) {
      const f = path.join(ANDI, m[1]);
      if (f.startsWith(ANDI) && fs.existsSync(f))
        return route.fulfill({
          status: 200,
          contentType: CT[path.extname(f)] || "application/octet-stream",
          body: fs.readFileSync(f),
        });
      external.push("MISSING " + u);
      return route.fulfill({ status: 404, body: "" });
    }
    if (/\/jquery[.-]/.test(u))
      return route.fulfill({
        status: 200,
        contentType: CT[".js"],
        body: fs.readFileSync(JQ),
      });
    external.push(u);
    return route.abort("blockedbyclient"); // hermetic guarantee
  });
  await page.goto(FIX, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: JQ });
  await page.addScriptTag({ path: path.join(ANDI, "andi.js") });
  await page.waitForFunction(
    () =>
      !!window.andiVersionNumber &&
      !!document.getElementById("ANDI508") &&
      !!window.testPageData &&
      typeof window.testPageData.numberOfAccessibilityAlertsFound === "number",
    { timeout: 30000 },
  );
  const alerts = await page.evaluate(
    () => window.testPageData.numberOfAccessibilityAlertsFound,
  );
  await browser.close();
  const offenders = external.filter((u) => !u.includes("logo.png")); // fixture's intentional 404 is fine
  console.log(
    "alerts:",
    alerts,
    "| blocked external (excl. fixture img):",
    offenders.length,
  );
  if (offenders.length) {
    console.log(offenders);
    process.exit(1);
  }
  if (alerts !== 2) {
    console.log("PARITY FAIL: expected 2, got", alerts);
    process.exit(1);
  }
  console.log("HERMETIC + PARITY OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3:** Run `node spikes/04-hermetic-vendor.cjs`. Expected: `HERMETIC + PARITY OK`,
      exit 0. If a non-`andi/` asset is missing (e.g. a module file ANDI fetches), copy it from
      the live run's URL list (see `docs/research-thread.md`) into `andi/` — but with a true fork
      it is already present.
- [ ] **Step 4: Commit** `test: prove hermetic vendored ANDI run (Phase 0 spike)`.

**Validation (acceptance):** spike prints `HERMETIC + PARITY OK`; 2 alerts; zero blocked
external requests beyond the fixture's intentional broken image. **If this fails, stop** —
the offline strategy needs revision before Phase 1.

---

# Phase 1 — Compliance-grade core

## Task 1.1 — `vendor-route.cjs`: hermetic routing as a reusable module

**Files:** Create `src/vendor-route.cjs`; Test `test/vendor-route.test.cjs`.

**Interfaces — Produces:** `installVendorRoutes(page) → Promise<{ externalAttempts: string[] }>`
(the array is mutated as the page runs; assert it after the scan).

- [ ] **Step 1: Write the failing test** (`test/vendor-route.test.cjs`): launch chromium, a
      page, `installVendorRoutes`, `goto` the focusable fixture, inject jQuery + `andi/andi.js`,
      wait ready, assert `externalAttempts` (excluding the fixture image) is empty and alerts === 2.
- [ ] **Step 2: Run** `node --test test/vendor-route.test.cjs` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/vendor-route.cjs` (promote the spike's single dispatching
      route into a function; export `installVendorRoutes` and `ANDI_DIR`):

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
};

async function installVendorRoutes(page) {
  const externalAttempts = [];
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
    const m = u.match(/\/accessibility\/andi\/(.+)$/);
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
    if (/\/jquery[.-]/.test(u))
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

- [ ] **Step 4: Run** the test → PASS. **Step 5: Commit** `feat: hermetic vendor routing`.

## Task 1.2 — Deterministic ready + module-stable signals

**Files:** Modify `src/scanner.cjs`; Test `test/ready-signal.test.cjs`.

**Interfaces — Produces:** `waitAndiReady(page, timeout)` and `waitModuleStable(page, timeout)`.

Replace all `page.waitForTimeout(...)` calls. `waitAndiReady` waits on the ready signal (see
reference table). `waitModuleStable` polls until the alerts list + `testPageData` are stable
across 2 consecutive 250ms polls:

```js
async function waitModuleStable(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const l = document.getElementById("ANDI508-alerts-list");
      const sig =
        (l ? l.innerHTML.length : 0) +
        ":" +
        (window.testPageData &&
          window.testPageData.numberOfAccessibilityAlertsFound);
      window.__sig = window.__sig || { v: null, n: 0 };
      if (window.__sig.v === sig) window.__sig.n++;
      else {
        window.__sig.v = sig;
        window.__sig.n = 0;
      }
      return window.__sig.n >= 2;
    },
    { timeout, polling: 250 },
  );
}
```

- [ ] Steps: write failing test (a scan completes with **no** fixed sleeps and returns 2
      alerts) → run FAIL → implement → run PASS → commit `feat: deterministic ANDI ready signals`.

## Task 1.3 — `extract.cjs`: hybrid extraction → `Finding[]`

**Files:** Create `src/extract.cjs` (move/refactor `extractFindings` out of `scanner.cjs`);
Test `test/extract.test.cjs`.

**Interfaces — Produces:** `extractFindings()` (runs in-page via `page.evaluate`) returning
`Finding[]` in the shape defined in `docs/ARCHITECTURE.md`. Prefer `window.andiAlerter`
(`.dangers/.warnings/.cautions`) → map each to a `Finding`; if `andiAlerter` is absent or
empty, fall back to the existing DOM scrape of `#ANDI508-alerts-list`. Each finding carries
`engine:'andi'`, the current `module`, `severity`, `rule` (alert label), `message`, and
`element` (`tag`, `html`, `andiIndex` from `data-andi508-index`, `selector` best-effort).

- [ ] Steps: write failing test asserting 2 `danger` findings for `focusable.html`, each with
      `engine:'andi'`, `module:'focusable'`, non-empty `element.html` → FAIL → implement
      internal-objects path + DOM fallback → PASS → commit `feat: hybrid ANDI extraction`.

## Task 1.4 — `modules.cjs`: launch-into-module, fresh context per module

**Files:** Create `src/modules.cjs`; Modify `src/scanner.cjs`; Test `test/modules.test.cjs`.

**Interfaces — Consumes:** `installVendorRoutes`, `waitAndiReady`, `waitModuleStable`,
`extractFindings`. **Produces:** `MODULES` (the `{f:'focusable',…}` registry) and
`scanModule(browser, url, moduleKey, opts) → Promise<Finding[]>` — opens a **fresh page**,
routes, injects, launches/selects the module, waits stable, extracts, closes.

- [ ] **Investigation step (record findings in a comment):** read `andi/andi.js` to determine
      whether ANDI can be **launched directly into** a module (a pre-set setting/hash) before
      auto-launch. If yes, set it before injection (cleanest). If no, click
      `#ANDI508-moduleMenu-button-<key>` after ready, then `waitModuleStable`.
- [ ] Steps: write failing tests — `scanModule(.., 'c')` on `contrast.html` returns the
      low-contrast finding; `scanModule(.., 't')` on `tables.html` returns the headerless-table
      finding → FAIL → implement → PASS → commit `feat: reliable per-module scanning`.

**Validation (acceptance, closes AC-001):** `contrast.html --module c` reports the
low-contrast paragraph; `tables.html --module t` reports the headerless table; both
deterministic across 5 consecutive runs.

## Task 1.5 — `aggregate.cjs`: merge across modules/engines

**Files:** Create `src/aggregate.cjs`; Test `test/aggregate.test.cjs`.

**Interfaces — Produces:** `aggregate(findingArrays) → { findings: Finding[], counts:
{danger,warning,caution,info}, worst: 'danger'|… }`. Concatenate, drop exact duplicates
(same `engine|module|rule|element.html`), keep both engines when ANDI and axe overlap on the
same element, sort by severity rank then module.

- [ ] Steps: write failing test (two module arrays + one duplicate → merged count correct,
      worst severity correct) → FAIL → implement → PASS → commit `feat: finding aggregation`.

## Task 1.6 — CLI: `--module all`, output dispatch, exit-code contract

**Files:** Modify `src/cli.cjs`, `src/scanner.cjs`; Create `src/report/text.cjs`,
`src/report/json.cjs`; Test `test/cli.test.cjs`.

`--module` accepts a single key or `all` (default `f`). `scan()` runs the requested modules
via `scanModule`, aggregates, returns the aggregate + metadata. `cli.cjs` dispatches to
reporters and exits per `--fail-on` using the **aggregate worst severity** (unchanged
contract: 0 = clean, 1 = findings ≥ threshold, 2 = scan error). Move the human report into
`src/report/text.cjs` and prepend the honesty banner.

- [ ] Steps: write failing tests asserting the exit-code matrix (below) → FAIL → implement →
      PASS → commit `feat: multi-module CLI + exit-code contract`.

## Task 1.7 — Per-module fixtures + integration suite (closes AC-002)

**Files:** Create `test/fixtures/{focusable,contrast,tables,structures,graphics,links,hidden,iframes}.html`,
`test/scan.integration.test.cjs`.

Each fixture embeds exactly one planted, documented violation for its module. The suite scans
each fixture for its module and asserts: finding count, severity, the flagged element, and the
CLI exit code under `--fail-on danger`.

- [ ] Steps: build the 8 fixtures (one violation each, commented) → write the integration test
      → run `npm test` → all green → commit `test: per-module fixtures + integration suite`.

---

# Phase 2 — Reporting & CI

## Task 2.1 — JSON reporter + documented schema

**Files:** `src/report/json.cjs` (finalize), `docs/output-schema.md`, `test/report-json.test.cjs`.
Emit `{ tool, version, scannedAt, urls[], findings[], counts, worst }`. Test: round-trips the
aggregate; matches the documented keys. Commit `feat: json reporter + schema`.

## Task 2.2 — SARIF 2.1.0 reporter

**Files:** Create `src/report/sarif.cjs`; Test `test/report-sarif.test.cjs`.
**Produces:** `toSarif(result) → object` (SARIF 2.1.0). `tool.driver.name='andi-cli'`,
`rules` = unique `(engine,rule)` with `helpUri` (axe rules carry their help URL; ANDI rules
link to ANDI docs), `results[].level` via `danger→error/warning→warning/caution|info→note`,
`locations[].physicalLocation.artifactLocation.uri = pageUrl` + `region.snippet.text =
element.html`, `logicalLocations[].fullyQualifiedName = element.selector`. Properties carry
`engine`, `module`, `wcag`.

- [ ] Steps: write failing test (validate output against the SARIF 2.1.0 JSON schema — vendor
      it to `test/fixtures/sarif-2.1.0.schema.json` and check with a tiny `ajv` check or a
      structural assert of required keys) → FAIL → implement the builder → PASS → commit
      `feat: SARIF 2.1.0 reporter`.

## Task 2.3 — JUnit XML reporter

**Files:** Create `src/report/junit.cjs`; Test `test/report-junit.test.cjs`.
One `<testsuite>` per `(url, module)`; one `<testcase>` per finding; severity ≥ `--fail-on`
→ `<failure message=… type=severity>` (escaped). Test: well-formed XML, failure count matches
findings ≥ threshold. Commit `feat: JUnit XML reporter`.

## Task 2.4 — HTML reporter

**Files:** Create `src/report/html.cjs`; Test `test/report-html.test.cjs`.
Single self-contained HTML string (inline CSS, no framework): honesty banner, per-URL →
per-module → per-severity grouping, element snippets, counts. Test: contains the banner, each
finding's message, and is parseable. Commit `feat: HTML report`.

## Task 2.5 — Sitemap / multi-URL scanning

**Files:** Create `src/sitemap.cjs`; Modify `src/cli.cjs`; fixtures `test/fixtures/sitemap/*`;
Test `test/sitemap.test.cjs`. `--urls <file>` (newline list) and `--sitemap <url|file>`
(parse `<loc>` from sitemap.xml). Scan each URL (reuse `scan`), aggregate into one report with
per-URL sections; exit code = worst across all. Optional `--concurrency <n>` (default 1).
Commit `feat: sitemap + multi-URL scanning`.

## Task 2.6 — Composite GitHub Action + SARIF upload

**Files:** Create `.github/actions/andi-scan/action.yml`; `docs/ci/github.md`.
Inputs: `url`/`urls`, `modules`, `fail-on`, `with-axe`, `sarif`, `html`. Runs the CLI, then a
step that uploads SARIF via `github/codeql-action/upload-sarif`. Document a 10-line usage
snippet. Commit `feat: GitHub Action + SARIF upload`.

## Task 2.7 — Dockerfile + npx

**Files:** Create `Dockerfile` (FROM `mcr.microsoft.com/playwright:v1.55.0`, copy repo,
`npm ci --omit=dev`, entrypoint `node src/cli.cjs`); verify `npx andi-scan --help` works from
the bin. Test: `docker build` succeeds; `node src/cli.cjs --help` exit 0. Commit
`feat: Docker image + npx entrypoint`.

## Task 2.8 — CI self-test workflow (dogfood the gate)

**Files:** Create `.github/workflows/selftest.yml`: on push/PR → `npm ci` →
`npx playwright install --with-deps chromium` → `npm test` → run `andi-scan` on a **clean**
fixture (expect exit 0) and on a **violation** fixture with `--fail-on danger` (expect the
job step to fail, asserted via `if: failure()` or an inverted check). Commit
`ci: self-test workflow`.

## Task 2.9 — GitLab/Jenkins snippets

**Files:** `docs/ci/gitlab.md`, `docs/ci/jenkins.md` — copy-paste pipeline stages using the
Docker image + JUnit artifact. Commit `docs: GitLab and Jenkins CI snippets`.

---

# Phase 3 — Optional axe-core layer (`--with-axe`)

## Task 3.1 — axe adapter on a clean page

**Files:** Create `src/engines/axe.cjs`; Test `test/axe.test.cjs`.
**Produces:** `runAxe(browser, url, opts) → Promise<Finding[]>` — opens its **own** page (no
ANDI injected, so axe sees the real DOM), runs `new AxeBuilder({ page }).analyze()`, maps
`violations[].nodes[]` to `Finding` (`engine:'axe'`, impact→severity, `wcag` from `tags`,
`element.html`/`selector` from the node). Guard: if `@axe-core/playwright` is not installed,
throw a clear "install @axe-core/playwright to use --with-axe" error.

- [ ] Steps: failing test (axe on `focusable.html` finds the empty-button/link, none flag
      ANDI's UI) → FAIL → implement → PASS → commit `feat: optional axe-core engine`.

## Task 3.2 — Merge axe into the aggregate

**Files:** Modify `src/aggregate.cjs`, `src/scanner.cjs`; Test `test/axe-merge.test.cjs`.
When `--with-axe`, run `runAxe` once per URL and feed its findings into `aggregate` alongside
ANDI's. Engine-labeled, de-duped per Task 1.5 rules. Commit `feat: merge axe + ANDI findings`.

## Task 3.3 — `--with-axe` CLI wiring + reporter labels

**Files:** Modify `src/cli.cjs`, all `src/report/*`; Test `test/with-axe-cli.test.cjs`.
Flag plumbs through; every reporter shows the `engine` label. Help text documents the layer.
Commit `feat: --with-axe flag`.

---

# Phase 4 — Launch

## Task 4.1 — README, CONTRIBUTING, SECURITY, provenance

Rewrite `README.md` for the federal-508 positioning + honesty about the automated/manual
boundary; add the "forked from SSAgov/ANDI" provenance + Apache-2.0/NOTICE; quickstart
(`npx`, Docker, Action). Add `CONTRIBUTING.md`, `SECURITY.md`. Commit `docs: launch docs`.

## Task 4.2 — Upstream-sync runbook + version-tracking test

**Files:** `docs/sync-upstream.md`; `test/version.test.cjs` (asserts the scanner reports
`andiVersion` and it equals `grep andiVersionNumber andi/andi.js`). Document the
fetch→merge→`npm test`→bump→tag flow. Commit `docs: upstream sync runbook + version test`.

## Task 4.3 — Publish

`.github/workflows/release.yml` (npm publish on tag), publish `andi-cli` (name confirmed free),
list the Action on the Marketplace, tag `v1.0.0`. **External/approval-gated** — do not publish
without Arun's go. Commit `ci: release workflow`.

## Task 4.4 — "Why ANDI in CI" writeup

A short post for the README/research-lab framing the gap, the federal audience, and the honest
coverage boundary. Commit `docs: why ANDI in CI`.

---

# Validation Plan

Each layer is an automated check unless marked manual. The gate is green only when all pass.

| #   | Layer                      | What it proves                           | How (command / assertion)                                                                      |
| --- | -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| V1  | **Hermetic network**       | Zero egress; CI can't break on ssa.gov   | Task 0.2 spike + `test/vendor-route.test.cjs`: `externalAttempts` (excl. fixture img) is empty |
| V2  | **Vendor parity**          | Vendoring didn't change ANDI's output    | Scan `fixture.html` vendored vs. live; assert identical alert set (count+severity+elements)    |
| V3  | **Per-module correctness** | Each module flags its planted violation  | `test/scan.integration.test.cjs` over the 8 fixtures: exact count + severity + element         |
| V4  | **Exit-code matrix**       | The gate contract holds                  | `test/cli.test.cjs`: for each `--fail-on` × fixture, assert 0/1/2 (table below)                |
| V5  | **Determinism**            | No flaky multi-module                    | Run module `c`,`t` scans 5× in CI; identical findings each run                                 |
| V6  | **SARIF validity**         | GitHub code scanning will ingest it      | Validate against SARIF 2.1.0 schema (`test/report-sarif.test.cjs`)                             |
| V7  | **JUnit validity**         | CI dashboards parse it                   | Well-formed XML; failure count = findings ≥ threshold                                          |
| V8  | **axe layer**              | Optional layer merges, labels, clean DOM | `--with-axe` on a fixture; axe findings labeled, none flag ANDI's UI                           |
| V9  | **Sitemap aggregation**    | Multi-page rolls up + worst exit code    | 2-page fixture sitemap → both pages present, exit = worst                                      |
| V10 | **CI self-test (dogfood)** | The Action actually gates real builds    | `selftest.yml`: clean fixture → green; violation + `--fail-on danger` → red                    |
| V11 | **Upstream-sync**          | New ANDI versions still pass             | After `git merge upstream`, `npm test` green; `test/version.test.cjs` matches                  |
| V12 | **Cross-platform**         | Works on the real CI target              | `selftest.yml` runs on `ubuntu-latest` (Linux) headless; macOS dev smoke                       |

### Exit-code matrix (V4)

| Fixture                      | `--fail-on danger` | `--fail-on warning` | `--fail-on caution` | `--fail-on none` |
| ---------------------------- | ------------------ | ------------------- | ------------------- | ---------------- |
| `focusable.html` (2 dangers) | 1                  | 1                   | 1                   | 0                |
| clean page (0 findings)      | 0                  | 0                   | 0                   | 0                |
| caution-only fixture         | 0                  | 0                   | 1                   | 0                |
| invalid URL (scan error)     | 2                  | 2                   | 2                   | 2                |

### Manual validation (human-in-the-loop, per `~/.agent-os` validation protocol)

- **MV1 — Real federal page:** scan a live `.gov` page, open the HTML report, and confirm the
  ANDI alerts match running the ANDI bookmarklet by hand on the same page (Trusted-Tester parity).
- **MV2 — GitHub PR annotations:** push a SARIF upload from a real PR; confirm findings render
  inline on the diff in the "Files changed" / Security tab.

---

# Execution Sequence (summary)

`0.1 → 0.2` (stop-gate) → `1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7` → `2.1 → 2.2 → 2.3 →
2.4 → 2.5 → 2.6 → 2.7 → 2.8 → 2.9` → `3.1 → 3.2 → 3.3` → `4.1 → 4.2 → 4.3 (approval) → 4.4`.

Phases are independently shippable: end of Phase 1 = a reliable multi-module gate; end of
Phase 2 = full CI product; Phase 3 = axe layer; Phase 4 = public launch.

## Non-goals (v1)

- Reimplementing ANDI checks · beating axe at generic a11y · authenticated/SPA crawling ·
  modifying `andi/` · a hosted SaaS.
