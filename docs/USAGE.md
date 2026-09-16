# Usage examples

The CLI is **not on npm yet**. Run it from a clone of this repo. After
`npm install` and `npx playwright install chromium`, the working command
is `node src/cli.cjs` (same as the future `andi-scan` binary).

A clean scan is **not** a Section 508 certification. The CLI matches
ANDI alerts on a rendered page; a human Trusted Tester still reviews.

## 1. Prove the install

The bundled fixture has deliberate violations. **Exit 1 is success.**

```bash
git clone https://github.com/arunsanna/andi-cli
cd andi-cli
npm install
npx playwright install chromium
npm run test:fixture
```

Expected: two danger findings (empty button, empty link) and exit `1`.

## 2. Scan a site you are about to ship

Build the app first. Point the scanner at the **rendered HTML** folder
(`dist/`, `build/`, `public/`, or `out/`). Source such as `.tsx` / `.vue`
is not scanned.

```bash
# From the andi-cli checkout:
node src/cli.cjs --dir /path/to/your-app/dist --module all --fail-on danger \
  --html /tmp/andi.html --sarif /tmp/andi.sarif --junit /tmp/andi.xml
```

`--fail-on danger` exits `1` when ANDI reports one or more danger alerts.
Use `--fail-on warning` for a stricter gate, or `--fail-on none` to always
write reports.

If the folder has no `.html` / `.htm` files, the command exits `2` and
tells you to build first.

## 3. Scan a live or staging URL

```bash
node src/cli.cjs --url https://staging.example.com --module all --fail-on danger
```

The page loads normally. ANDI's own files come from this repo, not from
live `ssa.gov`. Pages that require login are out of scope for v1.

## 4. Scan several pages

```bash
# Newline-separated file (# starts a comment)
node src/cli.cjs --urls urls.txt --module all --fail-on danger

# Every <loc> in a sitemap
node src/cli.cjs --sitemap https://example.com/sitemap.xml --concurrency 4
```

## 5. Reports

| What you want        | Flag                       |
| -------------------- | -------------------------- |
| Human text (default) | _(no flag)_                |
| JSON for a pipeline  | `--json --out report.json` |
| GitHub code scanning | `--sarif results.sarif`    |
| CI test dashboard    | `--junit report.xml`       |
| Shareable HTML       | `--html report.html`       |

```bash
node src/cli.cjs --dir ./dist --module all --fail-on none \
  --json --out andi.json \
  --sarif andi.sarif \
  --junit andi.xml \
  --html andi.html
```

JSON field names: [`output-schema.md`](output-schema.md).

## 6. Compare to the official ANDI bookmarklet

Local check (vendored ANDI on both sides — should be exact):

```bash
node src/parity-cli.cjs --serve-file examples/fixture.html --module all \
  --browser-source local --fail-on-diff
```

Against SSA's live bookmarklet script, serve the page over `http://127.0.0.1`
(not `file://`):

```bash
node src/parity-cli.cjs --url http://127.0.0.1:PORT/your-page \
  --module all --browser-source live --fail-on-diff \
  --markdown-out /tmp/andi-parity.md
```

## 7. Optional extras

```bash
# Fail if the scan tries to leave the machine (local/self-contained pages)
node src/cli.cjs --url file://$PWD/examples/fixture.html --strict-offline --fail-on none

# Second engine (needs optional @axe-core/playwright)
node src/cli.cjs --url https://example.com --with-axe --fail-on danger
```

`--with-axe` adds labeled axe findings. Default scans stay ANDI-only.

## Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | Nothing at or above `--fail-on` (or `--fail-on none`)                |
| `1`  | Findings at or above the threshold                                   |
| `2`  | Scan error, no HTML under `--dir`, or `--strict-offline` saw network |

## After npm / Docker exist

Those install paths are **not published**. Until then, clone this repo.
Intended later:

```bash
npx --package andi-cli andi-scan --dir ./dist --module all --fail-on danger
docker build -t andi-cli .
docker run --rm -v "$PWD:/work" andi-cli --dir /work/dist --module all --fail-on danger
```

Do not pass `andi-scan` as a Docker argument. The image entrypoint already
is the CLI (`docker run IMAGE --url ...`).
