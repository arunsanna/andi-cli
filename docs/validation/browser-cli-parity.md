# Browser ANDI vs CLI Parity Plan

**Goal:** Generate browser ANDI results and `andi-cli` results for the same target pages, normalize both outputs, and report exact matches, differences, and version drift.

**Architecture:** `src/parity.cjs` is the reusable harness. It runs the production CLI scan path and a browser-style ANDI path for the same URL/module, normalizes findings, and compares them as multisets. `src/parity-cli.cjs` is the operator command for local/manual parity runs.

## Phase 1: Deterministic Local Parity

Use vendored ANDI on both sides to prove the comparator itself is not adding noise.

```bash
node src/parity-cli.cjs \
  --serve-file examples/fixture.html \
  --module all \
  --browser-source local \
  --markdown-out results/parity-local.md \
  --out results/parity-local.json
```

Acceptance:

- All modules return `verdict: exact`.
- CLI and browser sources report the same `andiVersion`.
- Missing/extra finding lists are empty.

## Phase 2: Live Browser Bookmarklet Parity

Use SSA's live browser script for the browser side and vendored ANDI for the CLI side.

```bash
node src/parity-cli.cjs \
  --serve-file examples/fixture.html \
  --module all \
  --browser-source live \
  --markdown-out results/parity-live.md \
  --out results/parity-live.json
```

Acceptance:

- `andiVersion` matches. If not, treat findings as version drift first.
- Danger/warning findings match exactly on controlled fixtures.
- Any live-only or CLI-only finding is recorded with module, severity, message, and element.

## Phase 3: Real Page Sampling

Run the same command against a small page set:

- one simple static local page served with `--serve-file`
- one public non-authenticated page
- one staging app page
- one CSP-protected page if available

Acceptance:

- Non-authenticated pages complete without collection errors.
- Differences are classified as version drift, CSP/bookmarklet failure, or scanner mismatch.
- Scanner mismatches become bugs with a saved JSON report.

## Phase 4: CI Gate Candidate

Use deterministic local parity only in CI.

```bash
node src/parity-cli.cjs \
  --serve-file examples/fixture.html \
  --module all \
  --browser-source local \
  --fail-on-diff
```

Acceptance:

- CI fails only on real parity differences.
- Live SSA parity remains a manual/pre-release check, because it depends on public network availability and SSA hosting.

## Notes

- Prefer `--serve-file` over `file://` for live browser parity. The live bookmarklet can under-report on local `file://` pages.
- `--browser-source live` is closest to manual browser ANDI.
- `--browser-source local` is closest to a deterministic regression test.
