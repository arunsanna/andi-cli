# Docket — phased approach

> Status **2026-09-16.** Vision locked in conversation. Implementation has
> **not** started. Phase 0 is the next work. The first dogfood product is
> a real site Arun will provide (details later).
>
> andi-cli stays **Engine 1** (official ANDI). Docket is the product:
> the 508 **submission pack**, not another bookmarklet wrapper.

**Target:** one pack the team can submit. ANDI plus the other tests that
eat hours. Misses listed. A human signs. No “software certified 508.”

**Rule:** do not skip a gate. If a phase fails, stay there. Do not stack
engines on a broken login or an unlocked pack.

**Scoreboard:** after Phase 0, every later phase runs on the **real
site**, not only fixtures. Fixtures stay for ANDI parity.

---

## Phase 0 — Lock the pack

Write down the seven pieces of the docket. Empty is fine. Ground every
assumption (see `PHASE-0.md`). If it is not in the pack list, we are not
building it yet.

**Gate:** Arun looks at a blank pack and says “if this were full, we
could submit.” Agree what “done” means on the real site (user, flows,
what they file today).

## Phase 1 — Reach

Log in as the test user. Walk the named journeys. Record every screen
opened and every screen failed or not given a path.

**Gate:** Inventory is recognizable. Miss list is honest. Same paths
twice → same screens.

## Phase 2 — ANDI in the pack

Official ANDI on each reached screen. Findings filed under that screen.
Keep fixture bookmarklet parity so the engine did not drift.

**Gate:** On 2–3 real screens, a person clicks ANDI. Same danger/warning
story as Docket. Pack shows ANDI per screen, not one blob.

## Phase 3 — Rest of the first battery

Contrast the way testers finish it, and keyboard (tab, trap, focus
visible) on the same journeys.

**Gate:** Same screens have ANDI **and** contrast **and** keyboard. A
tester says this replaced a chunk of the afternoon.

## Phase 4 — 508 table + draft ACR + sign page

Map results onto Trusted Tester / Baseline-style rows: Pass, Fail, Does
not apply, Could not decide, Did not reach. Draft ACR. Cover: machine vs
human leftover.

**Gate:** The team does not rebuild a spreadsheet. Empty rows are only
human judgment. Pack is usable in an internal review.

## Phase 5 — One object + dogfood

One export. Run on the real release like CI (same login, same journeys).

**Gate:** Two releases in a row use the pack instead of assembling by
hand. Fix whatever they still copy-paste.

## Phase 6 — Capability

One-pager plus one real docket (secrets redacted). Story: we manufacture
the web 508 docket; the tester signs.

**Gate:** Fit to send a partner agency. Claim **the file**, not certified.

---

## Out of this program

No 508 stamp. No “we opened every possible screen.” No passwords in the
pack. No rewriting ANDI. No agency tour before Phase 5.

## Related

- Phase 0 plan and assumption register: [`PHASE-0.md`](PHASE-0.md)
- andi-cli launch leftovers (publish): [`../ANDI-CI-LAUNCH-PLAN.md`](../ANDI-CI-LAUNCH-PLAN.md)
