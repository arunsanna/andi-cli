# Contributing to andi-cli

## Dev setup

```bash
git clone https://github.com/arunsanna/andi-cli
cd andi-cli
npm install
npx playwright install chromium
```

Run the test suite:

```bash
npm test
```

Run the bundled fixture (has deliberate violations — expect exit 1):

```bash
npm run test:fixture
```

Both must be green before opening a pull request.

## Hard rule: never modify `andi/`

The `andi/` directory is the upstream vendored tree from [SSAgov/ANDI](https://github.com/SSAgov/ANDI), kept byte-for-byte unmodified. This is load-bearing:

- `git merge upstream/master` must be conflict-free on every sync.
- Any modification to `andi/` breaks Trusted-Tester alignment — the entire value of this tool is that it drives the **official, unmodified** `andi.js`.
- DOM selectors in `andi/andi.js` are version-coupled; changes there are tracked through the upstream sync model below, not through direct edits.

All wrapper code belongs in `src/`, `test/`, `.github/`, `docs/`, or `examples/`.

## Upstream sync model

When SSA publishes a new ANDI release:

1. `git fetch upstream && git merge upstream/master`
2. Run `npm test` — the selector-contract test (`test/selectors.contract.test.cjs`) guards load-bearing ANDI DOM selectors and will fail if SSA renamed something.
3. If the selector-contract test fails, update the corresponding extraction code in `src/` to match the new selectors, then re-run tests.
4. Bump the version in `package.json` to reflect the new ANDI version.
5. Open a PR with the merge commit and test evidence.

See `docs/sync-upstream.md` for the full runbook.

Improvements to ANDI itself (not the wrapper) should be contributed upstream to [SSAgov/ANDI](https://github.com/SSAgov/ANDI) as pull requests from this fork.

## Code style

- **CommonJS `.cjs` modules** throughout. No ESM, no TypeScript in v1.
- **Node >= 18.** Do not use APIs that require a newer runtime.
- **Playwright pinned at `1.55.1`** (Chromium build 1193). Do not bump the Playwright pin without updating the Docker base image and the CI matrix.
- **Conventional commits**, present tense, subject line under 72 characters. Examples:
  - `feat: add --timeout flag`
  - `fix: handle missing ANDI alerts list gracefully`
  - `test: add iframes module fixture`
  - `docs: update GitHub Actions example`
- No AI co-authorship attribution in commit messages or source files.

## Tests and fixtures

Tests live in `test/`. Each source module has a corresponding `test/<module>.test.cjs`.

- `test/fixtures/` — per-module HTML fixtures with documented, deliberate violations. Each fixture has exactly one planted violation so test assertions are unambiguous.
- `test/selectors.contract.test.cjs` — loads `andi/andi.js` headless and asserts load-bearing selectors are present. **Run after every upstream merge.**
- Integration tests in `test/scan.integration.test.cjs` run the full scanner against fixtures.

When adding a new module or output format, add a fixture and a test before implementing the feature (TDD). Tests must be deterministic — no fixed `sleep` calls; use the stability-poll pattern from `src/scanner.cjs`.

## Pull requests

- Open a PR against `main`.
- Include `npm test` output (all passing) in the PR description.
- For user-facing flag changes, update `README.md` and the relevant `docs/ci/*.md` snippet.
- Do not include changes to `andi/` unless they are an upstream merge commit.

## License

By contributing, you agree that your contributions are licensed under the Apache-2.0 license that covers this project.
