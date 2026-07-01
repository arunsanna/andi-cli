# andi-cli Ship-Or-Test Report - 2026-06-30

## Status

Ready for commit and CI rerun. Do not publish/tag until Arun confirms the exact release target and version.

## Release Targets

- npm package: `andi-cli`, exposing `andi-scan`, `andi-parity`, and `andi-benchmark`.
- GitHub composite action: `.github/actions/andi-scan`.
- Docker image: `ghcr.io/arunsanna/andi-cli`.

Current package version: `0.1.0`.

## Proof

- `npm test`: passed, 183/183.
- `npm audit --omit=dev`: `found 0 vulnerabilities`.
- `npm pack --dry-run --json`: `andi-cli@0.1.0`, 212 entries, required files present, forbidden prefixes absent.
- `npm run test:fixture`: expected exit 1 with two planted danger findings.
- `git diff --check`: passed.
- Upstream sync: `andi/` matches `upstream/master`; `andiVersionNumber = "29.2.2"`.
- Strict-offline release blocker fixed: CLI now forwards `--strict-offline` into single URL and URL-list scans, with regressions proving zero hits to a local HTTP target.

## Known Limitations

- Automated checks cover only a subset of Section 508.
- A clean scan is not a compliance certification and does not replace human Trusted-Tester review.
- v1 does not crawl authenticated sessions or complex SPA user flows.

## Remaining Risks

| Risk | Owner | Next action |
| --- | --- | --- |
| Local gate is green, but CI has not run on this uncommitted diff. | Codex / Arun | Commit, push, and verify GitHub Actions on the pushed SHA. |
| Publish target/version is not yet approved. | Arun | Confirm whether to ship `0.1.0` or bump before npm/GHCR/tag release. |
| Package publish, GHCR publish, and release tag are external/public actions. | Arun | Explicit approval required before running publish/tag commands. |

## Recommendation

Commit the launch-readiness changes, push, wait for CI green, then publish only after the version decision is confirmed.
