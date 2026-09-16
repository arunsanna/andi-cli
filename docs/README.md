# Documentation

Current product docs first. Historical files stay in the repo so the
research trail is intact — do not treat them as the live plan.

## Start here

| Doc                                                | What it is                                       |
| -------------------------------------------------- | ------------------------------------------------ |
| [`../README.md`](../README.md)                     | What the tool is, honest coverage, local install |
| [`USAGE.md`](USAGE.md)                             | Copy-paste usage examples                        |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)               | How it works and why those choices               |
| [`ANDI-CI-LAUNCH-PLAN.md`](ANDI-CI-LAUNCH-PLAN.md) | What is left before a public v1                  |

## Current product

| Doc                                                    | What it is                              |
| ------------------------------------------------------ | --------------------------------------- |
| [`output-schema.md`](output-schema.md)                 | JSON report shape                       |
| [`sync-upstream.md`](sync-upstream.md)                 | How to pull a new SSA ANDI release      |
| [`ci/github.md`](ci/github.md)                         | GitHub Action snippet                   |
| [`ci/gitlab.md`](ci/gitlab.md)                         | GitLab snippet                          |
| [`ci/jenkins.md`](ci/jenkins.md)                       | Jenkins snippet                         |
| [`security/threat-model.md`](security/threat-model.md) | Trust boundaries                        |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md)             | How to work in this repo                |
| [`../SECURITY.md`](../SECURITY.md)                     | How to report a vulnerability           |
| [`RESUME.md`](RESUME.md)                               | Latest checkpoint for a returning agent |

## Historical (do not execute from these)

| Doc                                                      | Why it is here                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`PLAN.md`](PLAN.md)                                     | Original phased build contract. Phases 0–3 are already implemented. Unchecked boxes are **not** open work.           |
| [`research-thread.md`](research-thread.md)               | 2026-06 origin note. Later spikes corrected the extraction approach.                                                 |
| [`ship-report-2026-06-30.md`](ship-report-2026-06-30.md) | June 30 launch-readiness snapshot.                                                                                   |
| [`validation/`](validation/)                             | Browser-vs-CLI evidence. Latest: [`validation/launch-parity-2026-09-16.md`](validation/launch-parity-2026-09-16.md). |

## Honest claims

- The CLI can match **ANDI alerts** on a rendered page.
- It does **not** certify Section 508 and does **not** replace a Trusted Tester.
- npm, the GHCR image, and a release tag are **not published** yet.
- Scan **built HTML**, not application source.
