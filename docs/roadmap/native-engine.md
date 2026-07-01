# Native engine roadmap

The current CLI intentionally wraps unmodified SSA ANDI because teams need
Trusted-Tester-aligned output now. The long-term direction is a CLI-first native
engine that can move beyond ANDI while keeping the developer workflow stable.

## Goals

- Keep `andi-scan` as the user-facing command.
- Keep report formats stable: text, JSON, SARIF, JUnit, HTML.
- Keep exit-code semantics stable.
- Add a scanner engine boundary so the CLI can run `andi` today and `native`
  later.
- Use ANDI as a compatibility oracle while the native engine matures.

## Engine boundary

Target interface:

```js
async function scanWithEngine(url, options) {
  return {
    engine: 'andi',
    url,
    scannedAt,
    findings,
    worst,
    externalRequests,
    metadata,
  };
}
```

Future engine names:

| Engine | Purpose |
| ------ | ------- |
| `andi` | Current compatibility engine using unmodified SSA ANDI. |
| `native` | CLI-first engine implemented directly against DOM, CSS, ARIA, and accessibility mappings. |
| `axe` | Optional secondary breadth engine where useful. |

## Migration phases

1. Extract a formal engine interface around the current ANDI path.
2. Add parity fixtures that compare `andi` and `native` output shape, not exact
   wording.
3. Implement native rules in small groups:
   - accessible names and focusable controls
   - images and graphics
   - links
   - table structure
   - headings, landmarks, and document structure
   - iframes
   - hidden and off-screen content
   - contrast
4. Add rule metadata with WCAG and Section 508 mappings.
5. Run dual-engine reports in CI.
6. Move teams to native defaults only after measured parity and false-positive
   review.

## Non-goals for the packaging phase

- Do not rewrite the scanner while building desktop packages.
- Do not change existing JSON/SARIF contracts without a versioned schema.
- Do not claim native compliance certification from automated checks alone.
