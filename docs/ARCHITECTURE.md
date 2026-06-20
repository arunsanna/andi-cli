# Architecture & Decision Record

> **Proven (2026-06-20):** ANDI v29.2.2 runs fully headless and yields scrapable 508
> alerts. `node src/cli.cjs --url file://…/examples/fixture.html` returns 2 danger alerts,
> exit code 1.
> **Designed, pending validation (this plan):** hermetic (offline) execution, reliable
> multi-module aggregation, SARIF/JUnit/HTML, optional axe layer. See `docs/PLAN.md`.

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
(registered with GSA code.gov as open source). We make `arunsanna/andi-cli` a **literal
GitHub fork** of it. This buys three things:

1. **Provenance** — GitHub's "forked from SSAgov/ANDI" badge is a trust signal the federal
   audience values; this _is_ ANDI, not a reimplementation.
2. **Upstream sync** — `git fetch upstream && git merge upstream/master` pulls SSA's ANDI
   changes; we cut a new `andi-cli` release that provably tracks the new ANDI version.
3. **Contribute back** — improvements to ANDI itself go upstream as PRs from the fork.

**License:** the fork is **Apache-2.0** for the whole repo (inherited). Our CLI code is
added under Apache-2.0 too (MIT-compatible, but a single license keeps the fork clean).

**Hard rule — never modify `andi/`.** All our code lives in separate top-level dirs
(`src/`, `test/`, `.github/`, `docs/`). The upstream ANDI tree (`andi/andi.js`, the module
files, CSS, icons) stays **byte-for-byte upstream** so `git merge upstream` is always
conflict-free. "Wrap, don't fork the _code_" holds even though we "fork the _repo_."

## Decision 3 — Hermetic (offline) execution via request routing

A network probe (`spikes/`, 2026-06-20) showed a single focusable scan makes **18 requests
— 15 to `ssa.gov`** (`andi.js`, `andi.css`, `fandi.js` (the focusable module!), and 11
icon PNGs) plus **1 to `ajax.googleapis.com`** (jQuery 3.7.1). That live dependency is
unacceptable for a compliance gate: a build must not fail because `ssa.gov` is down,
rate-limiting (`curl` already gets `403` from its CDN), or silently changed.

Because the fork **already contains every one of those files** (`andi/`), we make scans
hermetic by intercepting at the network boundary:

- `page.route('**/accessibility/andi/**', …)` fulfils every ANDI asset from the local
  `andi/` tree.
- jQuery is pinned (`src/vendor/jquery-3.7.1.min.js`) and pre-injected so ANDI skips its
  googleapis fetch.
- Any un-routed external request is **blocked and recorded** — a scan that tries to reach
  the network fails loudly rather than silently degrading.

Net result: identical output on every run, air-gapped CI included. This is the same
principle as a hermetic build — control the dependency at the boundary, don't trust the
internet at test time.

## Decision 4 — Extraction: internal objects first, DOM fallback

ANDI exposes its results both as DOM (`#ANDI508-alerts-list`) and as live JS objects
(`window.andiAlerter.{dangers,warnings,cautions}`, `window.testPageData`). We **prefer the
internal objects** (they are how ANDI itself stores results and survive module switches
that break DOM scraping) and fall back to DOM scraping when they are absent. Both normalize
to one `Finding` shape (below).

## Decision 5 — Multi-module: one fresh page context per module

ANDI is element-by-element and module-by-module by design; switching modules **in place**
is the source of today's flakiness (the alerts list does not reliably repopulate on a fixed
delay). Instead, each requested module in `{f,g,l,t,s,c,h,i}` runs in its **own fresh page**
(route → inject → launch into that module → wait on a deterministic completion signal →
extract → close), then results are aggregated. This trades a few seconds for deterministic
state isolation — the right trade for a gate. (Investigation task: whether ANDI can be
_launched directly into_ a module via a pre-set setting, avoiding the post-launch switch
entirely; fallback is select-then-wait-for-reanalysis.)

## Decision 6 — Optional axe-core layer (`--with-axe`), off by default

axe-core is the dominant generic engine but a _different category_ (automated pass/fail vs.
ANDI's Trusted-Tester aid). To keep the tool's identity sharp ("the ANDI gate"), axe is an
**opt-in second layer**, never the default. With `--with-axe`, `@axe-core/playwright` runs
on a **clean page load** (no ANDI UI to pollute its DOM), and results merge into the same
report **labeled by engine** (`engine: 'andi' | 'axe'`), de-duped on element+rule. axe adds
fast breadth; ANDI provides the federal alignment.

## Decision 7 — Output formats built for CI adoption

Research showed SARIF and JUnit are the formats that drive CI adoption and are
_underserved_ in OSS a11y (axe needs a stale third-party SARIF converter). We ship:

| Format          | Flag               | Purpose                                      |
| --------------- | ------------------ | -------------------------------------------- |
| Text            | (default)          | Human report + honesty banner                |
| JSON            | `--json` / `--out` | Machine processing                           |
| **SARIF 2.1.0** | `--sarif <file>`   | GitHub code scanning → inline PR annotations |
| **JUnit XML**   | `--junit <file>`   | CI test dashboards (GitHub/GitLab/Jenkins)   |
| **HTML**        | `--html <file>`    | Shareable report for VPAT/ACR authors        |

Every human-facing report carries an **honesty banner**: _"Automated checks cover a subset
of Section 508; ANDI surfaces items for human Trusted-Tester judgment."_ This is a
credibility feature — it is why reviewers trust the tool instead of over-relying on a green
check.

## The unified `Finding` shape

All engines/modules/reporters speak one shape:

```js
{
  engine:   'andi' | 'axe',
  module:   'focusable' | 'graphics' | 'links' | 'tables' | 'structures'
            | 'contrast' | 'hidden' | 'iframes' | null,   // null for axe
  severity: 'danger' | 'warning' | 'caution' | 'info',
  rule:     string,        // ANDI alert label, or axe rule id (e.g. 'image-alt')
  message:  string,
  wcag:     string[] | null,   // axe provides; ANDI mapped where known
  element:  { tag: string, html: string, selector: string | null,
              andiIndex: number | null },
}
```

Severity mapping for axe: `critical→danger`, `serious→warning`, `moderate→caution`,
`minor→info`. SARIF level mapping: `danger→error`, `warning→warning`, `caution/info→note`.

## Key DOM / JS reference (ANDI v29)

| What                        | Where                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ready signal                | `window.andiVersionNumber` set AND `#ANDI508` present AND `window.testPageData.numberOfAccessibilityAlertsFound` defined                                                          |
| Page summary                | `#ANDI508-pageAnalysis` (fallback `#ANDI508-additionalPageResults`)                                                                                                               |
| Alerts list (DOM fallback)  | `#ANDI508-alerts-list`                                                                                                                                                            |
| Alert group                 | `.ANDI508-alertGroup-container` (+ `ANDI508-display-<severity>`)                                                                                                                  |
| Group items                 | `.ANDI508-alertGroup-list > li`                                                                                                                                                   |
| Flagged page nodes          | `.ANDI508-element-danger` / `-warning` / `-caution` (exclude `#ANDI508` UI)                                                                                                       |
| Severity arrays (preferred) | `window.andiAlerter.{dangers,warnings,cautions}`                                                                                                                                  |
| Total count                 | `window.testPageData.numberOfAccessibilityAlertsFound`                                                                                                                            |
| Module buttons              | `#ANDI508-moduleMenu-button-{f,g,l,t,s,c,h,i}`                                                                                                                                    |
| Module files (in `andi/`)   | `fandi.js` (focusable), `landi.js` (links), `tandi.js` (tables), `sandi.js` (structures), `gandi.js` (graphics), `handi.js` (hidden), `candi.js` (contrast), `iandi.js` (iframes) |

## Non-goals

- Reimplementing ANDI's checks (defeats Trusted-Tester alignment).
- Beating axe-core at generic a11y (we are the ANDI gate; axe is an optional layer).
- Authenticated / SPA-session crawling in v1 (industry-wide gap; a future lever).

## Provenance

- Research thread: `docs/research-thread.md` + research-lab note.
- Licensing: ANDI = Apache-2.0, `github.com/SSAgov/ANDI` (verified 2026-06-20).
- Feasibility & network spikes: `spikes/` + `docs/spike-headless-proof.png`.
