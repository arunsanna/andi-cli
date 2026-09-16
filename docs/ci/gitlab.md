# GitLab CI — ANDI 508 Scan

Gate a pipeline on ANDI findings. Write SARIF / JUnit artifacts. A clean scan
is **not** a Section 508 certification.

> **Not published yet.** There is no `ghcr.io/arunsanna/andi-cli` image.
> Build the `Dockerfile` in this repo. The image entrypoint **is** the CLI —
> `docker run IMAGE --url ...` (flags only). Do **not** pass `andi-scan` as
> a Docker argument; it would be treated as a URL.

## Recommended: build the image, then `docker run`

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
      -v "$CI_PROJECT_DIR:/workspace"
      andi-cli-local
      --url "$TARGET_URL"
      --module all
      --fail-on danger
      --sarif /workspace/andi.sarif
      --junit /workspace/report.xml
  artifacts:
    when: always
    paths:
      - andi.sarif
    reports:
      junit: report.xml
    expire_in: 30 days
```

## Using the image as a job image

GitLab runs your `script:` in a shell. Clear the entrypoint and call Node
directly (`WORKDIR` in the image is `/app`):

```yaml
accessibility:
  stage: test
  image:
    name: andi-cli-local
    entrypoint: [""]
  variables:
    TARGET_URL: "https://staging.example.com"
  script:
    - node /app/src/cli.cjs
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
```

## Scanning multiple URLs

```yaml
accessibility:
  stage: test
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - docker build -t andi-cli-local .
  script:
    - |
      cat > urls.txt <<'EOF'
      https://staging.example.com/
      https://staging.example.com/login
      https://staging.example.com/dashboard
      EOF
    - docker run --rm
      -v "$CI_PROJECT_DIR:/workspace"
      andi-cli-local
      --urls /workspace/urls.txt
      --module all
      --fail-on danger
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

GitLab treats any non-zero exit from `script:` as a job failure. Use
`artifacts: when: always` so reports are kept when the gate fires.

## Notes

- `--fail-on danger` (the default) blocks only on `danger`-level findings.
  Use `--fail-on warning` for a stricter gate.
- Automated checks cover a subset of Section 508; ANDI surfaces items for
  human Trusted-Tester judgment.

More examples: [`../USAGE.md`](../USAGE.md).
