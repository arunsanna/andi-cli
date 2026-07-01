# Upstream Sync Runbook

How to pull SSA ANDI updates into this fork, verify the contract, and cut a release.

## When to run this

After SSA publishes a new ANDI release at https://github.com/SSAgov/ANDI — typically
announced via their repository commits or release notes. Check periodically or watch
the upstream repo.

## Prerequisites

- `upstream` remote points to `https://github.com/SSAgov/ANDI` or `git@github.com:SSAgov/ANDI`
- `git remote -v` shows it; if not, add one of:
  - `git remote add upstream https://github.com/SSAgov/ANDI`
  - `git remote add upstream git@github.com:SSAgov/ANDI`

## Steps

### 1. Fetch upstream

```bash
git fetch upstream
```

### 2. Merge upstream/master

```bash
git merge upstream/master
```

**Conflict rule: never edit `andi/`.**

- If `git status` shows conflicts inside `andi/`, accept upstream's version unconditionally:
  `git checkout --theirs andi/ && git add andi/`
- Conflicts in `src/`, `test/`, `docs/`, or `examples/` are our code — resolve normally.
- Conflicts in root files (`README.md`, `package.json`, `.gitignore`, `LICENSE`) — resolve
  manually, preserving andi-cli metadata (name, version, scripts, license header).

Commit the merge once all conflicts are resolved.

### 3. Run the full test suite

```bash
npm test
```

All 3 sub-suites must pass:

| Test file                                | What it guards                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `test/version.test.cjs` (V11)            | Scanner-reported `andiVersion` matches `andi/andi.js` source — catches a silent version skip |
| `test/selectors.contract.test.cjs` (V15) | Load-bearing DOM/JS surface is intact — see below                                            |
| Everything else                          | Regression suite for andi-cli behavior                                                       |

### 4a. If all tests are GREEN

Proceed to step 5.

### 4b. If `test/version.test.cjs` is RED

The scanner read the wrong `andiVersionNumber`, or `andi/andi.js` now declares the
version differently.

Check: `grep "andiVersionNumber" andi/andi.js`

The scanner reads `window.andiVersionNumber` after ANDI is ready (`src/modules.cjs`
step 8). If SSA renamed this variable, update `src/modules.cjs` and `src/andi-helpers.cjs`
(`waitAndiReady`) to match, and record the change in `docs/ARCHITECTURE.md`
(Key DOM / JS reference table).

### 4c. If `test/selectors.contract.test.cjs` (V15) is RED

**SSA changed a load-bearing selector.** This is a breaking upstream change. Do NOT
release until fixed.

| Failing assertion                 | What changed upstream                         | Where to fix                                                    |
| --------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `#ANDI508` missing                | Root container renamed                        | `src/andi-helpers.cjs` (`waitAndiReady`) + `src/extract.cjs`    |
| `#ANDI508-alerts-list` missing    | Alerts list renamed                           | `src/extract.cjs` + `src/andi-helpers.cjs` (`waitModuleStable`) |
| Ready-signal shape broken         | `andiVersionNumber` or `testPageData` renamed | `src/andi-helpers.cjs` (`waitAndiReady`)                        |
| No `.ANDI508-element-*` nodes     | Per-element class pattern renamed             | `src/extract.cjs`                                               |
| `AndiModule.launchModule` missing | Module API changed                            | `src/modules.cjs`                                               |

After fixing: update `docs/ARCHITECTURE.md` (Key DOM / JS reference table) to reflect
the new selector names, re-run `npm test`, confirm GREEN.

### 5. Bump the andi-cli version

```bash
npm version patch   # for a routine ANDI update
# or
npm version minor   # for new andi-cli features in the same release
```

This updates `package.json` and creates a git commit + tag automatically.

### 6. Update the README "tracks ANDI" line

In `README.md`, find the line that reads:

```
> Tracks ANDI vX.Y.Z
```

Update `X.Y.Z` to the new ANDI version: `grep "andiVersionNumber" andi/andi.js`

Stage and commit:

```bash
git add README.md
git commit -m "docs: update tracked ANDI version to vX.Y.Z"
```

### 7. Tag and push

```bash
git push origin main
git push origin --tags
```

## Quick-reference cheat sheet

```bash
git remote add upstream https://github.com/SSAgov/ANDI   # once; SSH is also OK
git fetch upstream
git merge upstream/master
# resolve conflicts (never edit andi/)
npm test                                                  # must be fully GREEN
grep "andiVersionNumber" andi/andi.js                    # confirm new version
npm version patch
# update README "tracks ANDI vX.Y.Z"
git add README.md && git commit -m "docs: update tracked ANDI version"
git push origin main --tags
```

## What each test catches

### `test/version.test.cjs` — V11 (version parity)

Reads `var andiVersionNumber = "..."` from `andi/andi.js` and compares it to
`result.andiVersion` returned by `scan()`. The scanner reads `window.andiVersionNumber`
live from the headless page after ANDI initializes. A mismatch means either:

- SSA changed the variable name (fix the scanner), or
- The scanner is not reading the variable at all (regression in inject path).

### `test/selectors.contract.test.cjs` — V15 (selector contract, Decision 9)

Loads `andi/andi.js` headlessly via the identical inject path used in production
(`bypassCSP` + `installVendorRoutes` + `injectAndi` + `waitAndiReady`), then asserts:

1. `document.getElementById('ANDI508')` exists after injection.
2. `document.getElementById('ANDI508-alerts-list')` exists after `launchModule('f')`.
3. `window.andiVersionNumber` is a string AND `testPageData.numberOfAccessibilityAlertsFound`
   is a number (ready-signal shape).
4. At least one `.ANDI508-element-{danger,warning,caution}` node is produced on the
   multi-module fixture (per-element mechanism works for `f/c/t/g/l` modules).
5. `typeof window.AndiModule.launchModule === 'function'` (programmatic module drive API
   is present).

A RED result here means SSA renamed or removed a load-bearing selector. The extractor
and docs must be updated before cutting a release.
