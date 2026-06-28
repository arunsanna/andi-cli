# Browser vs CLI Benchmark Review

Date: 2026-06-28

## Verdict

Final benchmark is exact: the CLI matches live browser ANDI on all 20 pages and all 160 page-module checks.

| Metric | Browser ANDI | CLI | Delta |
|---|---:|---:|---:|
| Pages exact | 20/20 | 20/20 | 0 |
| Modules exact | 160/160 | 160/160 | 0 |
| Danger | 32 | 32 | 0 |
| Warning | 450 | 450 | 0 |
| Caution | 578 | 578 | 0 |
| Info | 0 | 0 | 0 |
| Total findings | 1060 | 1060 | 0 |

## Saved Artifacts

- Fresh browser proof JSON: `test/fixtures/browser-benchmark/fresh-live-browser-andi-20-pages.json`
- Fresh browser proof Markdown: `test/fixtures/browser-benchmark/fresh-live-browser-andi-20-pages.md`
- Final comparison JSON: `test/fixtures/browser-benchmark/final-browser-vs-cli-benchmark.json`
- Final comparison Markdown: `test/fixtures/browser-benchmark/final-browser-vs-cli-benchmark.md`
- Graph report: `docs/validation/browser-cli-benchmark/browser-vs-cli-benchmark.html`
- Graph screenshot: `docs/validation/browser-cli-benchmark/browser-vs-cli-benchmark.png`
- Page totals chart: `docs/validation/browser-cli-benchmark/page-totals.svg`
- Parity scatter chart: `docs/validation/browser-cli-benchmark/parity-scatter.svg`
- Module delta heatmap: `docs/validation/browser-cli-benchmark/module-delta-heatmap.svg`

## What Was Fixed

1. Active module verification
   - Added a shared `waitActiveModule()` guard so extraction cannot read stale fANDI output after launching another module.
   - The former NASA solar-system outlier is now exact.

2. Page jQuery alignment
   - `injectAndi()` now preserves an existing supported page jQuery, matching SSA ANDI bookmarklet behavior.
   - This prevents the CLI from mutating target-page event/plugin state before lANDI/cANDI scans.

3. Target page readiness
   - The CLI now waits for browser-like page readiness before injection: load state plus a stable DOM signature.
   - This fixed dynamic CDC/W3C pages where early injection missed late controls or caught transient widgets.

4. Navigation resilience
   - Navigation now attaches at response commit, then opportunistically waits for DOMContentLoaded.
   - This fixed `https://data.nasa.gov/`, which can delay DOMContentLoaded long enough to create false CLI errors.

5. Vendor route safety
   - The vendor router no longer intercepts every URL containing `jquery`.
   - Target-page scripts now load from the target site instead of being replaced by the CLI's vendored jQuery.

## Final Per-Page Table

| ANDI did | ANDI results | Our results | Benchmark delta |
|---|---:|---:|---:|
| 01 `www.usa.gov/benefit-finder` - 8/8 modules exact | 21 | 21 | 0 |
| 02 `www.usa.gov/agencies` - 8/8 modules exact | 6 | 6 | 0 |
| 03 `www.grants.gov` - 8/8 modules exact | 10 | 10 | 0 |
| 04 `www.va.gov/disability` - 8/8 modules exact | 14 | 14 | 0 |
| 05 `www.va.gov/health-care/how-to-apply` - 8/8 modules exact | 11 | 11 | 0 |
| 06 `www.section508.gov` - 8/8 modules exact | 2 | 2 | 0 |
| 07 `www.section508.gov/test` - 8/8 modules exact | 10 | 10 | 0 |
| 08 `www.cdc.gov/wcms/4.0/cdc-wp/data-presentation/table.html` - 8/8 modules exact | 24 | 24 | 0 |
| 09 `www.cdc.gov/nndss/infectious-disease/index.html` - 8/8 modules exact | 39 | 39 | 0 |
| 10 `www.cdc.gov/places/tools/explore-places-data-portal.html` - 8/8 modules exact | 66 | 66 | 0 |
| 11 `www.w3.org/WAI/tutorials/forms` - 8/8 modules exact | 3 | 3 | 0 |
| 12 `www.w3.org/WAI/tutorials/tables` - 8/8 modules exact | 3 | 3 | 0 |
| 13 `www.w3.org/WAI/test-evaluate/preliminary` - 8/8 modules exact | 16 | 16 | 0 |
| 14 `www.nasa.gov` - 8/8 modules exact | 32 | 32 | 0 |
| 15 `science.nasa.gov/solar-system` - 8/8 modules exact | 260 | 260 | 0 |
| 16 `data.nasa.gov` - 8/8 modules exact | 19 | 19 | 0 |
| 17 `www.nist.gov` - 8/8 modules exact | 30 | 30 | 0 |
| 18 `www.epa.gov` - 8/8 modules exact | 23 | 23 | 0 |
| 19 `www.access-board.gov/ict` - 8/8 modules exact | 463 | 463 | 0 |
| 20 `www.access-board.gov/ta` - 8/8 modules exact | 8 | 8 | 0 |

## Verification

Run:

```bash
node --test test/vendor-route.test.cjs test/modules.test.cjs test/ready-signal.test.cjs test/parity.test.cjs test/benchmark.test.cjs test/browser-benchmark-proof.test.cjs test/final-benchmark-proof.test.cjs
```

The saved proof test verifies:

- all 20 refreshed browser pages completed successfully
- every page has all 8 ANDI modules
- browser and CLI totals match at page, module, severity, and aggregate level
- total benchmark delta is zero
