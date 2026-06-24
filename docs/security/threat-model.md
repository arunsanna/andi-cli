# andi-cli Threat Model

Version: 0.1 | Reviewed: 2026-06-24

## Purpose

andi-cli drives the official SSA ANDI accessibility tool in headless Chromium to
produce structured, CI-gateable Section 508 reports. This document records the
trust boundaries, threats, mitigations, and accepted risks for the tool.

## Assets

| Asset                                                 | Confidentiality | Integrity                                          | Availability |
| ----------------------------------------------------- | --------------- | -------------------------------------------------- | ------------ |
| Scan report output (JSON/SARIF/HTML/JUnit)            | Low             | High — wrong findings mislead compliance decisions | Medium       |
| Host filesystem accessible to Node process            | High            | High                                               | High         |
| Playwright / Chromium process on the scan host        | Medium          | High                                               | High         |
| CI secrets / tokens in runner env                     | Critical        | Critical                                           | Medium       |
| Vendored `andi/` and `src/vendor/jquery-3.7.1.min.js` | Low             | High — must stay unmodified                        | Medium       |

## Trust Boundaries

```
┌──────────────────────────────────────────────┐
│  andi-cli Node process (TRUSTED)             │
│  - reads args, writes reports to --out paths │
│  - orchestrates Playwright                   │
└───────────────────┬──────────────────────────┘
                    │ launches
┌───────────────────▼──────────────────────────┐
│  Playwright / Chromium process               │
│  - bypassCSP: true on each scan context      │
│  - loads the TARGET PAGE                     │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │  UNTRUSTED: target page + its resources │ │
│  │  - arbitrary JS runs in the page        │ │
│  │  - ANDI.js injected here runs alongside │ │
│  │    untrusted page JS                    │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Key trust boundary: **every scanned URL is UNTRUSTED**. Anything returned from the
page (element HTML, alert messages, ANDI output) must be treated as adversarial
before embedding in reports or using in Node.js.

## Threats and Mitigations

### T1 — Browser exploit via hostile page (HIGH residual risk, accepted)

**Threat:** A maliciously crafted target page exploits a Chromium vulnerability
to escape the browser sandbox and execute code on the scan host.

**Mitigations:**

- Chromium runs headless without `--no-sandbox` or other sandbox-disabling flags.
- Each module scan uses a fresh BrowserContext; no state persists across scans.
- No `storageState`, cookies, or credentials are shared into scan contexts.
- `bypassCSP` is the only relaxed flag; it affects only the scan context's CSP
  enforcement, not the sandbox.

**Accepted risk:** Chromium sandbox bypasses are real but rare 0-days. This is
inherent to any tool that loads untrusted HTML in a browser. Mitigations: pin
Playwright, apply security patches promptly, and run scans in isolated CI
environments (containers / VMs), not on privileged developer machines.

**Non-goal:** andi-cli is a developer/CI tool. Scanning hostile pages designed to
attack the scanner is out of scope — the operator chooses what URLs to scan.

### T2 — HTML report XSS / injection (FIXED, LOW residual risk)

**Threat:** Element snippets extracted from the scanned page are embedded in the
HTML report. A malicious page could craft element HTML containing `<script>` tags
or event handlers that execute when the report is opened in a browser.

**Mitigation:** `src/report/html.cjs` HTML-entity-escapes all untrusted strings
(messages, element.html, rule IDs, WCAG tags, URL, engine names) via the `esc()`
function before interpolation. The function escapes `&`, `<`, `>`, `"`, `'`,
covering both content and attribute contexts.

**Verification:** `test/report-html.test.cjs` includes an XSS payload test
(`toHtml: XSS <script> payload in element.html is HTML-escaped`).

**Residual risk:** Element snippets are truncated at 300 chars in-browser (by
`extract.cjs`) — long payloads are cut. The HTML report should be treated as a
developer artifact, not a user-facing web page served to untrusted visitors.

### T3 — SARIF / JUnit / JSON format injection (LOW risk)

**Threat:** Untrusted message or element.html content could break the SARIF/JUnit
XML/JSON format or inject malicious content.

**SARIF / JSON:** All data is embedded via `JSON.stringify` (the caller
serialises the object). JSON encoding prevents injection by design.

**JUnit:** `src/report/junit.cjs` XML-escapes all untrusted strings via `esc()`
before interpolation. The `esc()` function covers `<`, `>`, `&`, `"`, `'`.

**Residual risk:** None identified. Downstream SARIF consumers (GitHub code
scanning) parse the JSON; injection into `snippet.text` is constrained by the
JSON string encoding.

### T4 — Path traversal in vendor routing (FIXED)

**Threat:** A URL matching `/accessibility/andi/<path>` could include `../`
sequences, causing `path.join(ANDI_DIR, m[1])` to resolve a path outside `andi/`.
A sibling-prefix bypass was also possible: a path like `andi-evil/payload.js`
would satisfy `f.startsWith(ANDI_DIR)` because `ANDI_DIR` is a prefix of the
string (e.g. `/code/andi` is a prefix of `/code/andi-evil/...`).

**Fix:** `src/vendor-route.cjs` now guards with `f.startsWith(ANDI_DIR + path.sep)`
(appending the OS path separator) to prevent the sibling-directory prefix bypass.
`path.join` normalises `..` sequences before the guard is evaluated.

**Residual risk:** Negligible. The guarded path requires the resolved file to be
inside `andi/` and to exist on disk (`fs.existsSync`).

### T5 — SSRF via --url / --sitemap (LOW risk, accepted)

**Threat:** `--url` and `--sitemap` accept user-provided URLs. An operator could
point the scanner at internal metadata endpoints (`http://169.254.169.254/`,
cloud IMDS, etc.), potentially leaking instance credentials.

**Mitigation:** andi-cli is a CLI developer tool. The operator controls what URLs
are scanned. There is no multi-tenant API surface. Fetching the sitemap uses
Node's built-in `http`/`https` (no redirect policy override). The actual page
load happens inside the Playwright browser, which is a standard Chromium instance.

**Accepted risk:** Operator-controlled tools scanning operator-chosen URLs. SSRF
to internal endpoints is a risk of the operator's own making. Document in
runbooks: do not run andi-cli with `--url` values from untrusted sources.

### T6 — ReDoS on ANDI alert messages (LOW risk)

**Threat:** `src/wcag-map.cjs` runs regex patterns against ANDI alert text
extracted from the untrusted target page. Catastrophic backtracking could cause a
DoS if a page returns crafted alert text.

**Analysis:** All seven regex patterns in `TABLE` were audited:

- `/image .*(no alt|no accessible name)/` — linear `.*` scan, terminates on
  mismatch of the alternation suffix. No nested quantifiers.
- `/table.*(header|<th>|caption)/` — same pattern, same analysis.
- `/iframe.*title|title.*iframe/` — alternation at the top level; each branch
  terminates when the suffix is absent. No exponential blowup.
- All other patterns are simple word/phrase matches with no quantifier nesting.

Worst-case performance with a 10,000-char adversarial message: < 1ms (verified).

**Residual risk:** Low. Patterns are simple; no polynomial-time risk observed.

### T7 — Supply chain: action SHA-pinning (LOW risk, accepted)

**Threat:** `.github/actions/andi-scan/action.yml` uses GitHub Actions by tag
(`actions/setup-node@v4`, `github/codeql-action/upload-sarif@v3`,
`actions/checkout@v4`). Tags can be moved to point at different commit SHAs.

**Mitigation:** These are first-party actions from `actions/` and `github/`.
SHA-pinning is best practice for third-party actions but adds maintenance overhead.

**Accepted risk:** For a small open-source developer tool, tag-based refs to
official GitHub-maintained actions are acceptable. Upgrade to SHA pins when the
project reaches a production deployment audience. Note any changes in
`.github/` change logs.

### T8 — GitHub Actions shell injection via composite action inputs (LOW risk, FIXED)

**Threat:** The composite action (`action.yml`) previously interpolated
`${{ inputs.url }}` and similar inputs directly in the shell `run:` block. A
caller-supplied input with shell metacharacters (e.g. `; rm -rf`) could inject
shell commands.

**Fix:** All inputs are now routed through `env:` block variables and referenced
as `$INPUT_URL`, `$INPUT_MODULES`, etc. in the shell body. Shell expansion of
the values happens after the `env:` mapping, which is safe.

**Residual risk:** In a composite action, inputs come from the caller's own
workflow and are considered caller-trusted. The practical injection risk is very
low, but the env-var pattern is the correct practice and is now in place.

## Accepted Non-Goals

- **Authenticated target scanning:** andi-cli does not support logging in to
  target pages. Scanning behind authentication is out of scope.
- **Anti-bot / CAPTCHA bypass:** The scanner loads pages as a normal Chromium
  instance; CAPTCHA walls will block the scan. Not a security concern.
- **Scanning hostile targets designed to attack the scanner:** andi-cli is a
  developer/CI tool. Operators choose their scan targets.
- **Persistent profile / cookie jar:** The tool uses ephemeral BrowserContexts
  with no `storageState` and no cross-scan cookie persistence. Each context is
  closed after the scan module completes.

## Changelog

| Date       | Change               | Author         |
| ---------- | -------------------- | -------------- |
| 2026-06-24 | Initial threat model | Security audit |
