# Launch parity results — 2026-09-16

Side-by-side of **andi-cli** (Playwright + vendored ANDI) vs **official
ANDI** (Playwright injecting the live SSA bookmarklet script). Both
sides ran all 8 modules. A match means the same alerts, same counts, same
ANDI version — not a Section 508 certification.

Raw JSON (gitignored): `results/launch-2026-09-16/`.

## 1. Planted fixture — `examples/fixture.html`

Served at `http://127.0.0.1/.../fixture.html` (not `file://`).

| Check                       | Result                    |
| --------------------------- | ------------------------- |
| CLI vs local vendored ANDI  | **8/8 exact**             |
| CLI vs live SSA bookmarklet | **8/8 exact**             |
| Version                     | ANDI 29.2.2 on both sides |
| Exit                        | `--fail-on-diff` = 0      |

| Module     | CLI | Official ANDI | Match |
| ---------- | --: | ------------: | ----- |
| focusable  |   2 |             2 | exact |
| graphics   |   1 |             1 | exact |
| links      |   1 |             1 | exact |
| tables     |   1 |             1 | exact |
| structures |   0 |             0 | exact |
| contrast   |   2 |             2 | exact |
| hidden     |   0 |             0 | exact |
| iframes    |   0 |             0 | exact |

What both sides found (same text, same elements):

| Severity | Module    | Alert                                                                             | Element    |
| -------- | --------- | --------------------------------------------------------------------------------- | ---------- |
| danger   | focusable | Button has no accessible name, innerText, or [title].                             | `<button>` |
| danger   | focusable | Link has no accessible name, innerText, or [title].                               | `<a>`      |
| danger   | graphics  | Image has no accessible name, [alt], or [title].                                  | `<img>`    |
| danger   | links     | Link has no accessible name, innerText, or [title].                               | `<a>`      |
| danger   | tables    | Table has no `<th>` cells.                                                        | `<table>`  |
| danger   | contrast  | Text does not meet minimum AA contrast ratio (4.5:1).                             | `<p>`      |
| caution  | contrast  | Page has images; If images contain meaningful text, perform manual contrast test. | page       |

## 2. Live dogfood page — https://www.section508.gov/test/

CLI vs live SSA bookmarklet. **8/8 exact.** `--fail-on-diff` exit 0.

| Module     | CLI | Official ANDI | Match |
| ---------- | --: | ------------: | ----- |
| focusable  |   0 |             0 | exact |
| graphics   |   1 |             1 | exact |
| links      |   0 |             0 | exact |
| tables     |   0 |             0 | exact |
| structures |   0 |             0 | exact |
| contrast   |   8 |             8 | exact |
| hidden     |   1 |             1 | exact |
| iframes    |   0 |             0 | exact |

What both sides found (same text, same counts):

| Severity | Module   | Alert                                                                             | Times |
| -------- | -------- | --------------------------------------------------------------------------------- | ----: |
| caution  | graphics | Ensure that background images are decorative.                                     |     1 |
| warning  | contrast | Element has background-image; Perform manual contrast test.                       |     7 |
| warning  | contrast | Page has images; If images contain meaningful text, perform manual contrast test. |     1 |
| warning  | hidden   | Content has been injected using CSS pseudo-elements ::before or ::after.          |     1 |

No danger alerts on that page.

Note: the rolled-up `andi-scan --json` report **de-duplicates** identical
page-level messages, so it printed 4 rows (2 contrast + hidden + graphics)
instead of 10. The parity harness counts each ANDI alert the way the
bookmarklet list does. Use `andi-parity` when you need that 1:1 count.

## 3. What this does **not** prove

- A human did not click the bookmarklet in a visible browser on this date.
  The “official ANDI” side is the same `andi.js` SSA serves, injected in
  headless Chromium — the same mechanism as the bookmarklet.
- A clean or matching scan is not a Trusted-Tester certification.
