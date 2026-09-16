# Resume — andi-cli

> Checkpoint **2026-09-16**. Read `docs/README.md` first, then `README.md` and
> `docs/ANDI-CI-LAUNCH-PLAN.md`. Run `npm run test:fixture` (expect exit 1).

## Where we are

The scanner is built. CLI vs official ANDI matched 8/8 on the fixture and
on https://www.section508.gov/test/. Action `dir`/`urls` now follow the
caller’s repo; Docker has `andi-scan` on PATH. **Do not publish** until
Arun approves.

Proven on this Mac (2026-09-16):

- `npm run test:fixture` exits 1 with two planted danger findings
- `--dir examples --module f --fail-on danger` finds both example pages
- local `andi-parity` on the fixture is **8/8 exact**

Not available yet: npm package, GHCR image, git tags, `release.yml`.

## What the product does

Runs official unmodified ANDI (v29.2.2) in headless Chromium and fails CI
when ANDI reports findings at a chosen severity. On the same rendered
page, CLI alerts can match the SSA bookmarklet. That is **not** a Section
508 certification and does **not** replace a Trusted Tester.

## Next (Docket)

Phased approach: `docs/docket/PHASED-APPROACH.md`. **Phase 0** is current:
`docs/docket/PHASE-0.md`. Real site details come from Arun later.

## Next (andi-cli launch sequence)

1. ~~Restore the local Mac CLI~~ — done
2. ~~Freeze claim language + clean docs~~ — done
3. ~~Make “scan my repository” foolproof (`--dir` on a source tree)~~ — done
4. ~~Compare CLI to official ANDI (fixture + section508.gov)~~ — done
5. ~~Fix Action workspace paths + Docker `andi-scan` on PATH~~ — done
6. **Stop for publish approval**

## Do not treat as current

- `docs/PLAN.md` unchecked boxes — historical build contract; Phases 0–3 shipped
- `docs/research-thread.md` — origin research; some early extraction notes were later corrected
- `docs/ship-report-2026-06-30.md` — June 30 snapshot
