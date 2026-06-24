# Security Audit Report — andi-cli

Date: 2026-06-24
Auditor: Security audit pass (automated + manual review)
Branch: main

---

## npm audit — before / after

### Before (playwright 1.55.0)

```
1 high severity vulnerability
  playwright < 1.55.1
  GHSA-7mvr-c777-76hp: Playwright downloads and installs browsers without
  verifying the authenticity of the SSL certificate (CWE-347)
```

### After (playwright 1.55.1)

```
found 0 vulnerabilities
```

---

## Findings Table

| #   | Severity | Issue                                                                                                                           | File                                       | Status                                                                                         |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | HIGH     | playwright < 1.55.1 — GHSA-7mvr-c777-76hp SSL cert verification bypass during browser install                                   | package.json                               | **FIXED** — bumped to 1.55.1                                                                   |
| 2   | HIGH     | Path traversal: `f.startsWith(ANDI_DIR)` allows sibling-prefix bypass (`andi-evil/` satisfies guard)                            | src/vendor-route.cjs line 27               | **FIXED** — hardened to `f.startsWith(ANDI_DIR + path.sep)`                                    |
| 3   | MED      | GitHub Actions shell injection: `${{ inputs.url }}` and other inputs interpolated directly into `run:` shell block              | .github/actions/andi-scan/action.yml       | **FIXED** — all inputs routed through `env:` block variables                                   |
| 4   | MED      | GitHub workflows missing `permissions:` blocks — default GITHUB_TOKEN has broad write access                                    | .github/workflows/selftest.yml, docker.yml | **FIXED** — added `permissions: contents: read` to both workflows                              |
| 5   | LOW      | Pin note in CLAUDE.md + Dockerfile referenced incorrect Chromium build 1187 (both 1.55.0 and 1.55.1 use 1193)                   | CLAUDE.md, Dockerfile                      | **FIXED** — updated to 1193 and playwright 1.55.1                                              |
| 6   | LOW      | HTML report `esc()` — already covers `&`, `<`, `>`, `"`, `'` in both content and attribute contexts                             | src/report/html.cjs                        | **Accepted** — coverage verified, no gaps found                                                |
| 7   | LOW      | SARIF reporter — untrusted data serialised via `JSON.stringify`; no raw string interpolation                                    | src/report/sarif.cjs                       | **Accepted** — JSON encoding prevents injection by design                                      |
| 8   | LOW      | JUnit reporter `esc()` — covers `<`, `>`, `&`, `"`, `'`                                                                         | src/report/junit.cjs                       | **Accepted** — coverage verified, no gaps found                                                |
| 9   | LOW      | ReDoS risk in wcag-map.cjs regex patterns on ANDI alert text                                                                    | src/wcag-map.cjs                           | **Accepted** — all 7 patterns audited; no nested quantifiers; adversarial 10k-char input < 1ms |
| 10  | LOW      | SSRF via `--url` / `--sitemap` — operator-supplied URLs; could target internal metadata endpoints                               | src/cli.cjs, src/sitemap.cjs               | **Accepted** — operator-controlled tool, documented in threat model                            |
| 11  | LOW      | Browser exploit via hostile page — arbitrary JS runs in scan context with bypassCSP:true                                        | src/modules.cjs, src/scanner.cjs           | **Accepted** — inherent to headless accessibility scanning; mitigations documented             |
| 12  | LOW      | Action tag-based refs (not SHA-pinned) — `actions/checkout@v4`, `actions/setup-node@v4`, `github/codeql-action/upload-sarif@v3` | .github/actions/andi-scan/action.yml       | **Accepted** — first-party GitHub-maintained actions; SHA pinning deferred                     |
| 13  | INFO     | No `storageState`, no persistent profile, no cross-scan cookies — ephemeral BrowserContext per module scan                      | src/modules.cjs                            | **Verified** — no state leakage between scans confirmed                                        |
| 14  | INFO     | No `child_process` / shell exec anywhere in `src/`                                                                              | src/                                       | **Verified** — no command injection surface                                                    |
| 15  | INFO     | No secrets / API keys / tokens in tracked files (excl. andi/, node_modules/, .superpowers/)                                     | all tracked files                          | **Verified** — secret scan clean                                                               |

---

## Findings by Severity

| Severity  | Total  | Fixed        | Accepted                 |
| --------- | ------ | ------------ | ------------------------ |
| HIGH      | 2      | 2            | 0                        |
| MED       | 2      | 2            | 0                        |
| LOW       | 8      | 1 (pin note) | 7                        |
| INFO      | 3      | —            | 3 (verified clean)       |
| **Total** | **15** | **5 fixed**  | **10 accepted/verified** |

---

## Playwright 1.55.1 Chromium Compatibility

Both playwright 1.55.0 and 1.55.1 use **identical Chromium revision 1193**
(confirmed by diffing `browsers.json` from both `playwright-core` tarballs).
The 1.55.1 bump is a pure security patch fixing GHSA-7mvr-c777-76hp; zero
Chromium change.

The CLAUDE.md pin note previously said "build 1187" — this was incorrect.
Both versions have always required revision 1193. Updated to 1193.

---

## npm test status

**Pure unit tests (no browser): 74/74 PASS**

Browser-dependent tests (extract, modules, version, vendor-route, sitemap,
cli integration) require the Chromium headless shell binary
(`chromium_headless_shell-1193`) to be installed via `npx playwright install`.
In the current environment the CDN download is blocked (sandboxed network),
causing those tests to fail with "Executable doesn't exist" — this is a
pre-existing environment constraint, identical for both 1.55.0 and 1.55.1.

To run the full suite locally after `npm ci`, run:

```
npx playwright install chromium
npm test
```

---

## Files Changed

| File                                        | Change                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `package.json`                              | playwright 1.55.0 → 1.55.1                                                     |
| `package-lock.json`                         | updated lock                                                                   |
| `Dockerfile`                                | base image v1.55.0-noble → v1.55.1-noble; comment: build 1187 → 1193           |
| `CLAUDE.md`                                 | pin note: 1.55.0/1187 → 1.55.1/1193                                            |
| `src/vendor-route.cjs`                      | path guard: `startsWith(ANDI_DIR)` → `startsWith(ANDI_DIR + path.sep)`         |
| `.github/actions/andi-scan/action.yml`      | inputs → env vars to prevent shell injection; comment: build 1187 → 1193       |
| `.github/workflows/selftest.yml`            | added `permissions: contents: read`                                            |
| `.github/workflows/docker.yml`              | added `permissions: contents: read`                                            |
| `SECURITY.md`                               | expanded: untrusted-page model, path-traversal fix, vendor routing, full scope |
| `docs/security/threat-model.md`             | new — assets, trust boundaries, T1–T8 threats with mitigations                 |
| `.superpowers/sdd/security-audit-report.md` | this file                                                                      |
