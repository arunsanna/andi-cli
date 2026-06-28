# Browser Benchmark Proof

This documents the browser-side benchmark proof. The original frozen snapshot is kept for history; the final parity benchmark uses the refreshed browser proof captured after the CLI readiness fixes.

## Captured Proof

- Historical JSON fixture: `test/fixtures/browser-benchmark/live-browser-andi-20-pages.json`
- Historical Markdown summary: `test/fixtures/browser-benchmark/live-browser-andi-20-pages.md`
- Historical collection time: `2026-06-28T12:51:40.256Z`
- Final refreshed JSON fixture: `test/fixtures/browser-benchmark/fresh-live-browser-andi-20-pages.json`
- Final refreshed Markdown summary: `test/fixtures/browser-benchmark/fresh-live-browser-andi-20-pages.md`
- Final refreshed collection time: `2026-06-28T14:52:41.633Z`
- Source: live SSA browser bookmarklet, refreshed
- Pages: 20 public pages
- Modules per page: focusable, graphics, links, tables, structures, contrast, hidden, iframes

The final refreshed browser batch captured:

| Severity | Count |
|---|---:|
| Danger | 32 |
| Warning | 450 |
| Caution | 578 |
| Info | 0 |
| Total | 1060 |

Top signal pages:

| Page | D | W | C | Notes |
|---|---:|---:|---:|---|
| `https://www.access-board.gov/ict/` | 0 | 75 | 388 | Highest total finding count |
| `https://science.nasa.gov/solar-system/` | 8 | 131 | 121 | Focusable, link, and contrast danger examples |
| `https://www.nasa.gov/` | 16 | 16 | 0 | Contrast danger examples |
| `https://www.nist.gov/` | 7 | 18 | 5 | Graphics and contrast danger examples |
| `https://www.cdc.gov/wcms/4.0/cdc-wp/data-presentation/table.html` | 0 | 21 | 3 | Dynamic CDC page after page-settle fixes |

## Test Gate

Run the proof test before CLI benchmarking:

```bash
node --test test/browser-benchmark-proof.test.cjs test/final-benchmark-proof.test.cjs
```

The test verifies:

- the historical artifact remains intact
- the refreshed artifact is the final live-browser proof
- all 20 pages completed successfully
- every page has all 8 ANDI modules
- aggregate severity totals match the captured baselines
- the final browser-vs-CLI benchmark has zero page, module, severity, and total delta

## Final Benchmark

The final saved comparison is:

- JSON: `test/fixtures/browser-benchmark/final-browser-vs-cli-benchmark.json`
- Markdown: `test/fixtures/browser-benchmark/final-browser-vs-cli-benchmark.md`
- Graph report: `docs/validation/browser-cli-benchmark/browser-vs-cli-benchmark.html`

Result: 20/20 pages exact, 160/160 modules exact, total delta 0.
