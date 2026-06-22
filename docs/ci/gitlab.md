# GitLab CI — ANDI 508 Scan

Add an `accessibility` job to your `.gitlab-ci.yml` to gate pipelines on Section 508
findings. The job runs the official `andi-cli` Docker image, writes a SARIF report, and
uses the CLI exit code to pass or fail the pipeline.

## Minimal job

```yaml
accessibility:
  stage: test
  image: ghcr.io/arunsanna/andi-cli:latest
  variables:
    TARGET_URL: "https://staging.example.com"
  script:
    - andi-scan --url "$TARGET_URL" --module all --fail-on danger --sarif andi.sarif --junit report.xml
  artifacts:
    when: always
    paths:
      - andi.sarif
    reports:
      junit: report.xml
    expire_in: 30 days
```

## Full example with HTML report and multiple modules

```yaml
accessibility:
  stage: test
  image: ghcr.io/arunsanna/andi-cli:latest
  variables:
    TARGET_URL: "https://staging.example.com"
  script:
    - andi-scan
      --url "$TARGET_URL"
      --module all
      --fail-on danger
      --sarif andi.sarif
      --html andi-report.html
      --junit report.xml
  artifacts:
    when: always
    paths:
      - andi.sarif
      - andi-report.html
    reports:
      junit: report.xml
    expire_in: 30 days
  allow_failure: false # non-zero exit fails the pipeline
```

## Scanning multiple URLs

```yaml
accessibility:
  stage: test
  image: ghcr.io/arunsanna/andi-cli:latest
  script:
    - |
      cat > urls.txt <<'EOF'
      https://staging.example.com/
      https://staging.example.com/login
      https://staging.example.com/dashboard
      EOF
    - andi-scan --urls urls.txt --module all --fail-on danger --sarif andi.sarif --junit report.xml
  artifacts:
    when: always
    paths:
      - andi.sarif
    reports:
      junit: report.xml
    expire_in: 30 days
```

## Using the Dockerfile instead of the pre-built image

If you prefer to build the image from source (e.g., to pin a specific commit):

```yaml
accessibility:
  stage: test
  image: docker:latest
  services:
    - docker:dind
  variables:
    TARGET_URL: "https://staging.example.com"
  before_script:
    - docker build -t andi-cli-local .
  script:
    - docker run --rm
      -e TARGET_URL
      -v "$CI_PROJECT_DIR:/workspace"
      andi-cli-local
      andi-scan --url "$TARGET_URL" --module all --fail-on danger
      --sarif /workspace/andi.sarif
  artifacts:
    when: always
    paths:
      - andi.sarif
    expire_in: 30 days
```

## All CLI flags

| Flag               | Default  | Description                                                                         |
| ------------------ | -------- | ----------------------------------------------------------------------------------- |
| `--url <url>`      | _(none)_ | Single URL to scan (`http://`, `https://`, or `file://`).                           |
| `--urls <file>`    | _(none)_ | Newline-separated file of URLs (`#` = comment line).                                |
| `--sitemap <url>`  | _(none)_ | Sitemap XML to fetch/read; scan all `<loc>` entries.                                |
| `--module <key>`   | `f`      | ANDI module(s): `f`=focusable, `g`=graphics, `l`=links, `t`=tables,                 |
|                    |          | `s`=structures, `c`=contrast, `h`=hidden, `i`=iframes, `all`=run all.               |
| `--fail-on <lvl>`  | `danger` | Exit 1 when worst finding severity ≥ level: `danger`\|`warning`\|`caution`\|`none`. |
| `--sarif <file>`   | _(none)_ | Write SARIF 2.1.0 results to `<file>`.                                              |
| `--html <file>`    | _(none)_ | Write self-contained HTML report to `<file>`.                                       |
| `--junit <file>`   | _(none)_ | Write JUnit XML results to `<file>` (for GitLab test reports / CI dashboards).      |
| `--out <file>`     | _(none)_ | Write full JSON results to `<file>`.                                                |
| `--strict-offline` | off      | Exit 2 if any external network requests are detected during the scan.               |

## Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | No findings at or above `--fail-on` threshold (or `--fail-on none`). |
| `1`  | One or more findings at or above threshold — pipeline fails.         |
| `2`  | Scan error, or `--strict-offline` detected external network calls.   |

GitLab treats any non-zero exit code from `script:` as a job failure. The pipeline
therefore fails automatically when `andi-scan` exits 1 or 2. To collect artifacts even
on failure (recommended so you can review findings), use `artifacts: when: always`.

## Notes

- `--fail-on danger` (the default) blocks only on `danger`-level findings. Use
  `--fail-on warning` for a stricter gate.
- The SARIF file is importable into GitLab's security dashboard when the
  [SAST configuration][sast] is active, or can be archived as a pipeline artifact for
  manual review.
- Automated checks cover a subset of Section 508; ANDI surfaces items for human
  Trusted-Tester judgment.

[sast]: https://docs.gitlab.com/ee/user/application_security/sast/
