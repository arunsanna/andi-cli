# GitHub Actions — ANDI 508 Scan

The composite action at `.github/actions/andi-scan` runs ANDI headless, writes
SARIF 2.1.0, and uploads the results to GitHub code scanning so findings appear
as inline annotations on pull requests.

## Minimal workflow

```yaml
name: 508 scan

on:
  pull_request:
  push:
    branches: [main]

permissions:
  security-events: write # required for upload-sarif

jobs:
  andi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: arunsanna/andi-cli/.github/actions/andi-scan@main
        with:
          url: https://your-staging-url.example.com
```

## All inputs

| Input            | Default              | Description                                                                                                                               |
| ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `url`            | _(none)_             | Single URL to scan (`http://`, `https://`, or `file://`). Required unless `urls` is provided.                                             |
| `urls`           | _(none)_             | Path to a newline-separated file of URLs (`#` = comment line).                                                                            |
| `modules`        | `f`                  | ANDI module(s): `f`=focusable, `g`=graphics, `l`=links, `t`=tables, `s`=structures, `c`=contrast, `h`=hidden, `i`=iframes, `all`=run all. |
| `fail-on`        | `danger`             | Exit 1 when worst finding severity ≥ this level: `danger` \| `warning` \| `caution` \| `none`.                                            |
| `with-axe`       | `false`              | Also run axe-core alongside ANDI and label findings by engine.                                                                            |
| `sarif`          | `andi-results.sarif` | Output path for the SARIF 2.1.0 file uploaded to code scanning.                                                                           |
| `html`           | _(none)_             | Output path for a self-contained HTML report (optional).                                                                                  |
| `strict-offline` | `false`              | Exit 2 if any external network requests are detected during the scan.                                                                     |

## Full example with multiple options

```yaml
name: 508 scan

on: [pull_request]

permissions:
  security-events: write

jobs:
  andi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: arunsanna/andi-cli/.github/actions/andi-scan@main
        with:
          url: https://staging.example.com
          modules: all
          fail-on: warning
          sarif: andi-results.sarif
          html: andi-report.html

      # Upload HTML as a workflow artifact (optional, separate from SARIF)
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: andi-html-report
          path: andi-report.html
```

## Scanning multiple URLs

```yaml
- name: Write URL list
  run: |
    cat > urls.txt <<'EOF'
    https://staging.example.com/
    https://staging.example.com/login
    https://staging.example.com/dashboard
    EOF

- uses: arunsanna/andi-cli/.github/actions/andi-scan@main
  with:
    urls: urls.txt
    fail-on: danger
    sarif: andi-results.sarif
```

## SARIF and inline PR annotations

When `security-events: write` is set and `upload-sarif` runs, GitHub code
scanning indexes the findings. On a pull request, violations appear as inline
review comments on the Files Changed tab under the **Security** panel. The
`fail-on` gate fires _after_ SARIF is uploaded, so annotations are always
visible even when the job fails.

SARIF severity mapping:

| ANDI severity | SARIF level |
| ------------- | ----------- |
| `danger`      | `error`     |
| `warning`     | `warning`   |
| `caution`     | `note`      |
| `info`        | `note`      |

## Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | No findings at or above `--fail-on` threshold (or `--fail-on none`). |
| `1`  | One or more findings at or above threshold.                          |
| `2`  | Scan error, or `--strict-offline` detected external network calls.   |

## Notes

- Playwright pin: `1.55.1` (Chromium build 1193). The action installs Chromium
  via `npx playwright install --with-deps chromium` on each run.
- Automated checks cover a subset of Section 508; ANDI surfaces items for human
  Trusted-Tester judgment.
- The `with-axe` flag is implemented as an optional second engine; default scans
  remain ANDI-only.
