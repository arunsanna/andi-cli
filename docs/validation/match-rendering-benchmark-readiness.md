# Match Rendering Benchmark Readiness

This runbook prepares the real benchmark for the Match repo/build output.

## Goal

Measure three separate claims without mixing them:

1. Real `andi-scan` subprocess output matches a browser-rendered ANDI oracle for
   the same page URL.
2. `--dir` is equivalent to scanning the same rendered folder through explicit
   localhost URLs.
3. Direct `file://` scans are informational and may differ from localhost when a
   site uses root-relative assets, base tags, routing, or client-side scripts.

## Preflight For Match

Before running the benchmark, produce a rendered static output directory for
Match. Use the Match repo's own approved build command; this repo should not
guess its package manager or install path.

The benchmark target should be a directory containing `.html` or `.htm` files,
typically one of:

- `dist/`
- `build/`
- `out/`
- `public/`

Quick preflight:

```bash
find /path/to/match-output -name '*.html' -o -name '*.htm' | sort | head
```

## Benchmark Command

Use local browser oracle first because it is deterministic and uses the same
vendored ANDI version as the CLI:

```bash
node spikes/08-real-rendering-benchmark.cjs \
  --site match=/path/to/match-output \
  --browser-source local \
  --module all \
  --timeout 30000 \
  --max-pages 50 \
  --out-dir results/match-rendering-benchmark/$(date -u +%Y-%m-%dT%H-%M-%SZ)
```

For a stronger network-dependent check, run live browser ANDI on localhost too:

```bash
node spikes/08-real-rendering-benchmark.cjs \
  --site match=/path/to/match-output \
  --browser-source both \
  --module all \
  --timeout 45000 \
  --max-pages 50 \
  --out-dir results/match-rendering-benchmark/$(date -u +%Y-%m-%dT%H-%M-%SZ)
```

Do not use `--strict-offline` for the main Match benchmark unless the point is
to test hermetic failure behavior. Explicit localhost `--urls` scans do not have
the `--dir` allowed-origin exemption.

## Acceptance Gates

Treat these as the benchmark readiness criteria:

- `localhost vs local browser`: every page should be exact, with zero CLI errors.
- `--dir vs --urls`: counts and finding fingerprints should match.
- `localhost vs live browser`: exact when the live SSA ANDI bookmarklet loads;
  if it fails, label it as a network/oracle availability issue, not a CLI drift.
- `file:// vs localhost`: record the result, but do not require exactness.

If `file://` differs from localhost, prefer `--dir` for Match. That means the
folder must be rendered through a web server for representative results.

## Output Files

Each run writes:

- `real-rendering-benchmark.md` - concise human summary
- `real-rendering-benchmark.json` - full structured evidence
- `sites/<site>/*.cli.json` - raw real CLI subprocess outputs
- `sites/<site>/localhost.urls.txt` - explicit localhost URL list used for the
  `--urls` comparison

Outputs live under ignored `results/` until promoted into tracked docs.

## Promotion Rule

After a clean Match run, promote only the summary and the smallest useful JSON
evidence into `docs/validation/`. Keep bulky per-page artifacts under ignored
`results/` unless Arun asks to save the full benchmark set in the repository.
