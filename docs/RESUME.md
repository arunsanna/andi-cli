# Resume — andi-cli

> Checkpoint **2026-09-16**. Read `docs/README.md` first, then `README.md` and
> `docs/ANDI-CI-LAUNCH-PLAN.md`. Run `npm run test:fixture` (expect exit 1).

## Where we are

The scanner is built. Remaining launch work is bookmarklet comparison on
one real site, then fixing GitHub / Jenkins so another team can use it.
**Do not publish** until Arun approves.

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

## Next (launch sequence)

1. ~~Restore the local Mac CLI~~ — done
2. ~~Freeze claim language + clean docs~~ — done
3. ~~Make “scan my repository” foolproof (`--dir` on a source tree)~~ — done
4. Compare one real site to the official bookmarklet
5. Fix Action / Docker / Jenkins consumer path
6. **Stop for publish approval**

## Do not treat as current

- `docs/PLAN.md` unchecked boxes — historical build contract; Phases 0–3 shipped
- `docs/research-thread.md` — origin research; some early extraction notes were later corrected
- `docs/ship-report-2026-06-30.md` — June 30 snapshot
