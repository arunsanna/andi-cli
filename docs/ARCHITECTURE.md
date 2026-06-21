# Architecture & Decision Record

> **Proven (2026-06-20 spikes):** ANDI v29.2.2 runs fully headless; the CLI returns 2 danger
> alerts / exit 1 on the fixture. **Hermetic execution is proven** — routing every ANDI asset
> from a local `andi/` clone yields a scan with **zero external requests** and identical
> findings (`spikes/04`, `spikes/05`). `AndiModule.launchModule(letter)` drives modules
> programmatically. **Extraction is DOM-primary** (internal objects proved unreliable —
> Decision 4).
> **Designed, pending build:** CSP bypass for protected targets, multi-module aggregation,
> ANDI→WCAG mapping, SARIF/JUnit/HTML, optional axe layer, sitemap. See `docs/PLAN.md`.

## The problem

The SSA's **ANDI** is a manual JavaScript bookmarklet for Section 508 / WCAG inspection.
It is the tool the U.S. federal **Trusted-Tester** process is keyed to, but it requires a
human to click element-by-element. No CLI, no CI, no site-wide reporting. Research
(2026-06-20) confirmed there is **no open-source, Trusted-Tester-aligned, CI-native
tool** — axe-core/pa11y/IBM Equal Access serve generic a11y but not ANDI's alert set, and
the federal-grade options (Level Access AMP) are commercial and opaque-priced. That gap —
federal agencies, contractors, state `.gov`, and VPAT/ACR authors who are _required_ to
align with ANDI and have zero automation — is the project's wedge.

## Decision 1 — Wrap the official `andi.js`, never reimplement it

We inject the **unmodified** official `andi.js` into a Playwright-driven headless Chromium
page. ANDI auto-launches on injection and builds its full `ANDI508-*` UI with zero human
interaction. Reimplementing ANDI's checks would drift from its exact alerts and lose the
Trusted-Tester alignment that is the entire value. Wrapping guarantees parity and inherits
SSA's updates.

## Decision 2 — Repo model: a literal fork of `SSAgov/ANDI`

ANDI's source is public at **`github.com/SSAgov/ANDI`** under the **Apache License 2.0**
(verified by reading `LICENSE.md`; registered with GSA code.gov as open source). We make
`arunsanna/andi-cli` a **literal GitHub fork**. This buys three things:

1. **Provenance** — GitHub's "forked from SSAgov/ANDI" badge is a trust signal the federal
   audience values; this _is_ ANDI, not a reimplementation.
2. **Upstream sync** — `git fetch upstream && git merge upstream/master` pulls SSA's ANDI
   changes; we cut a new `andi-cli` release that provably tracks the new ANDI version.
3. **Contribute back** — improvements to ANDI itself go upstream as PRs from the fork.

**License:** the fork is **Apache-2.0** for the whole repo. **Hard rule — never modify
`andi/`.** All our code lives in `src/`, `test/`, `.github/`, `docs/`. The upstream tree
stays byte-for-byte so `git merge upstream` is conflict-free. Because ANDI's DOM selectors
are version-coupled, an upstream merge can silently break extraction even when the version
test passes — so a **selector-contract test** (Decision 9) guards every sync, not just a
version-string check.

## Decision 3 — Hermetic (offline) execution via request routing + CSP bypass

A network probe (2026-06-20) showed a single focusable scan makes **18 requests — 15 to
`ssa.gov`** (`andi.js`, `andi.css`, `fandi.js`, 11 icons) plus **1 to googleapis** (jQuery).
That live dependency is unacceptable for a compliance gate. Because the fork **already
contains every one of those files** (`andi/`), we make scans hermetic at the network
boundary:

- `page.route('**/*', …)` serves every ANDI asset and the pinned jQuery from local files.
- Any un-routed external request is **blocked and recorded**; `--strict-offline` fails the
  run if that list is non-empty.

**CSP bypass (load-bearing for the target audience).** ANDI is injected with `addScriptTag`,
which a target page's `Content-Security-Policy` — common on federal `.gov` — would block,
along with the (routed) ANDI module/CSS fetches. The browser **context is created with
`bypassCSP: true`**, which disables CSP enforcement for the automated scan so injection and
the locally-routed assets always load. Net: the page can neither block our injection (CSP
off) nor reach the network (routes abort externals). `bypassCSP` is a Playwright
testing-time context flag; it does not alter what real users experience and is the correct
tool for an automated scanner. (A target that defends against automation in other ways —
e.g. requiring auth — is a documented non-goal.)

## Decision 4 — Extraction: DOM-primary (grounded by spike, 2026-06-20)

> **Corrected.** An earlier draft preferred ANDI's internal JS objects. `spikes/05`
> disproved that.

ANDI exposes results as DOM (`#ANDI508-alerts-list` groups + `.ANDI508-element-*` flagged
nodes) and as live JS objects. The spike proved the **internal objects are unreliable**:
`andiAlerter.{dangers,warnings,cautions}` is a transient buffer ANDI empties after analysis
(read `0/0/0` for the focusable and contrast modules even after a 1.2s settle), and
`testPageData.pageAlerts` is empty. The **DOM is authoritative**:

- grouped alert messages ← `#ANDI508-alerts-list` (`.ANDI508-alertGroup-*`)
- per-element offenders ← `.ANDI508-element-{danger,warning,caution}` (exclude `#ANDI508` UI)

**Count semantics (resolved — this is what tests assert):** the **per-element DOM count is
authoritative** for `Finding[]` and all test assertions (consistent every run: f:2, c:4,
t:3, g:3 on the planted fixture). `testPageData.numberOfAccessibilityAlertsFound` counts
ANDI _alert types/occurrences_ (grouped) and differs from the element count (e.g. contrast
total=3 vs 4 elements); it is surfaced as a separate informational `andiAlertTotal` field,
**never** as the assertion basis. This validates the existing `src/scanner.cjs` DOM approach.

## Decision 5 — Multi-module: fresh page context per module, driven by `launchModule`

ANDI is module-by-module by design and switching **in place** is unreliable (the original
flakiness). `spikes/04` proved `andi.js` exposes `AndiModule.launchModule(letter)` (≈ line
132; `var host_url` is hardcoded at line 11 — which is _why_ routing, not variable override,
is the hermetic mechanism). Each requested module in `{f,g,l,t,s,c,h,i}` runs in its **own
fresh page** (route → inject → `launchModule(letter)` → wait for the alerts list + total to
stabilize across 3 polls + a settle → extract from the DOM → close), then results aggregate.
Fresh-context isolation produced consistent per-module counts where in-place reads did not.

## Decision 6 — Optional axe-core layer (`--with-axe`), off by default

axe-core is the dominant generic engine but a _different category_ (automated pass/fail vs.
ANDI's Trusted-Tester aid). To keep the tool's identity sharp ("the ANDI gate"), axe is an
**opt-in second layer**, never the default. With `--with-axe`, `@axe-core/playwright` runs
on a **clean page load** (no ANDI UI to pollute its DOM), and results merge **labeled by
engine** (`engine: 'andi' | 'axe'`). axe adds breadth; ANDI provides the federal alignment.

## Decision 7 — Output formats built for CI adoption

| Format          | Flag               | Purpose                                      |
| --------------- | ------------------ | -------------------------------------------- |
| Text            | (default)          | Human report + honesty banner                |
| JSON            | `--json` / `--out` | Machine processing                           |
| **SARIF 2.1.0** | `--sarif <file>`   | GitHub code scanning → inline PR annotations |
| **JUnit XML**   | `--junit <file>`   | CI test dashboards (GitHub/GitLab/Jenkins)   |
| **HTML**        | `--html <file>`    | Shareable report for VPAT/ACR authors        |

Every human-facing report carries an **honesty banner**: _"Automated checks cover a subset
of Section 508; ANDI surfaces items for human Trusted-Tester judgment."_

## Decision 8 — ANDI→WCAG mapping: explicit, best-effort, honest about coverage

SARIF and VPAT/ACR consumers want a WCAG success-criterion per finding, but ANDI's DOM
emits human alert _text_, not criterion IDs. We maintain an explicit map
(`src/wcag-map.cjs`) keyed by a normalized ANDI alert signature → `{ ruleId, wcag[],
helpUri }`. It is **partial by design**: mapped alerts carry their WCAG tags; unmapped
alerts get `wcag: null` and a generic ANDI help URL, and the docs state coverage honestly
(no false precision). Seed entries (extend as modules land):

| ANDI alert (normalized)           | ruleId               | WCAG         |
| --------------------------------- | -------------------- | ------------ |
| no accessible name (control)      | `no-accessible-name` | 4.1.2        |
| image no alt / no accessible name | `image-no-name`      | 1.1.1        |
| low contrast                      | `low-contrast`       | 1.4.3        |
| table missing headers             | `table-no-headers`   | 1.3.1        |
| skipped/empty heading             | `heading-structure`  | 1.3.1, 2.4.6 |
| iframe no title                   | `iframe-no-title`    | 4.1.2, 2.4.1 |
| duplicate id                      | `duplicate-id`       | 4.1.1        |

## Decision 9 — Selector-contract test guards every upstream sync

Because the fork tracks upstream ANDI, a future SSA release could rename a load-bearing
selector and silently zero out findings while the version test still passes. A
`test/selectors.contract.test.cjs` asserts, after loading `andi/andi.js` headless, that
`#ANDI508`, `#ANDI508-alerts-list`, the `.ANDI508-element-*` mechanism, the ready signal
shape, and `AndiModule.launchModule` are all present. It runs in CI and is mandatory after
every `git merge upstream`.

## The unified `Finding` shape

```js
{
  engine:   'andi' | 'axe',
  module:   'focusable' | 'graphics' | 'links' | 'tables' | 'structures'
            | 'contrast' | 'hidden' | 'iframes' | null,   // null for axe
  severity: 'danger' | 'warning' | 'caution' | 'info',
  rule:     string,        // ANDI ruleId from wcag-map, or axe rule id (e.g. 'image-alt')
  message:  string,
  wcag:     string[] | null,   // from src/wcag-map.cjs (ANDI) or axe tags; null if unmapped
  element:  { tag: string, html: string, selector: string | null,
              andiIndex: number | null },
}
```

Severity mapping for axe: `critical→danger`, `serious→warning`, `moderate→caution`,
`minor→info`. SARIF level: `danger→error`, `warning→warning`, `caution/info→note`.

## Key DOM / JS reference (ANDI v29)

| What                                      | Where                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Ready signal                              | `window.andiVersionNumber` set AND `#ANDI508` present AND `window.testPageData.numberOfAccessibilityAlertsFound` is a number |
| Drive a module (PREFERRED)                | `AndiModule.launchModule('<letter>')` — programmatic; do not menu-click                                                      |
| Alerts list (DOM, PRIMARY)                | `#ANDI508-alerts-list` (`.ANDI508-alertGroup-*`)                                                                             |
| Flagged page nodes (ASSERTION BASIS)      | `.ANDI508-element-{danger,warning,caution}` (exclude `#ANDI508` UI)                                                          |
| ANDI page total (informational only)      | `testPageData.numberOfAccessibilityAlertsFound`                                                                              |
| Severity arrays (UNRELIABLE — do not use) | `window.andiAlerter.{dangers,warnings,cautions}` — transient buffer emptied after analysis (`spikes/05`)                     |
| CSP bypass                                | `browser.newContext({ bypassCSP: true })` — required for protected `.gov` targets                                            |
| Module files (in `andi/`)                 | `fandi`(f) `landi`(l) `tandi`(t) `sandi`(s) `gandi`(g) `handi`(h) `candi`(c) `iandi`(i)                                      |

## Non-goals

- Reimplementing ANDI's checks (defeats Trusted-Tester alignment).
- Beating axe-core at generic a11y (we are the ANDI gate; axe is an optional layer).
- Authenticated / SPA-session crawling in v1 (industry-wide gap; a future lever).
- Targets that defend against automation beyond CSP (e.g. bot-walls) — out of scope.

## Provenance

- Research thread: `docs/research-thread.md` + research-lab note.
- Licensing: ANDI = Apache-2.0, `github.com/SSAgov/ANDI` (read `LICENSE.md`, 2026-06-20).
- Feasibility / hermetic / extraction spikes: `spikes/01`–`05` + `docs/spike-headless-proof.png`.
