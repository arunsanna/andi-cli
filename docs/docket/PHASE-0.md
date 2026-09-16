# Docket Phase 0 — Lock the pack and ground assumptions

> **In progress.** Phase 0 is not “write code.” It is: freeze the empty
> docket, mark every assumption grounded or not, and get the missing
> facts. Ungrounded items **are** Phase 0 work.

## What Phase 0 delivers

1. **Pack contract** — the seven pieces below, in writing. Empty
   templates are allowed. If a future feature is not in this list, it
   waits.
2. **Assumption register** — each claim is `grounded` (with source) or
   `open` (what would ground it).
3. **Dogfood brief (stub)** — slots for the real site Arun will provide.
   We do not invent the product.

**Gate:** Arun confirms the blank pack is the thing they would submit if
full, and we are not building from a fantasy process.

## The seven pieces (pack contract)

| #   | Piece            | What it is                                                      |
| --- | ---------------- | --------------------------------------------------------------- |
| 1   | Scope            | Product, release, test user (no password), in / out of scope    |
| 2   | Screen inventory | Every screen opened: name, how we got there, shot, time         |
| 3   | Missed screens   | Failed login/path, never settled, **or no path given**          |
| 4   | Test rows        | Pass / Fail / Does not apply / Could not decide / Did not reach |
| 5   | Evidence         | Which engine, which screen, snippet or shot                     |
| 6   | Draft ACR        | Tables a human edits and signs                                  |
| 7   | Honesty page     | Machine vs human leftover vs not in scope                       |

andi-cli (official ANDI) is **Engine 1** and files into pieces 4–5.
Contrast and keyboard come in Phase 3. Mapping onto the agency’s real
row list is Phase 4 — Phase 0 only locks that those rows _exist_.

## Assumption register

### Grounded (do not re-litigate)

| ID  | Assumption                                                                                                                       | Why it is grounded                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | A scanner must not stamp “Section 508 certified.”                                                                                | Federal evidence is an ACR (usually VPAT). Trusted Tester certifies **people**. [section508.gov ACR/VPAT](https://www.section508.gov/sell/how-to-create-acr-with-vpat/), [Trusted Tester](https://www.section508.gov/test/trusted-tester/). |
| G2  | Trusted Tester web process has **63** test conditions covering **41** web requirements.                                          | Trusted Tester Conformance Test Process for Web v5.1.3.                                                                                                                                                                                     |
| G3  | Named helper tools in that process are **ANDI** and a **color contrast** tool. Other tools need documented equivalence per test. | Same process, Testing Tools section.                                                                                                                                                                                                        |
| G4  | ANDI is an inspector for a person, not a full 508 engine.                                                                        | SSA test method; ANDI FAQ; process allows **Not Tested** when tools cannot decide.                                                                                                                                                          |
| G5  | Official ANDI can run headless and match the bookmarklet on a rendered page.                                                     | This repo: fixture 8/8 local + live; `section508.gov/test/` 8/8 live (2026-09-16).                                                                                                                                                          |
| G6  | Many 508 hours are **assembly** (screens, notes, tables), not only clicking ANDI.                                                | Stated product pain; matches how ACRs are built.                                                                                                                                                                                            |
| G7  | A test-user login and named journeys are a normal browser-automation job.                                                        | Capability is proven in the industry (Playwright and every UI test suite). **Not** yet proven on Arun’s site.                                                                                                                               |
| G8  | Docket is the pack; andi-cli is Engine 1. We do not rewrite ANDI.                                                                | Vision lock 2026-09-16.                                                                                                                                                                                                                     |
| G9  | “Everything” means everything on the agreed map, plus an honest miss list.                                                       | Vision lock; a machine cannot invent hidden/2FA/flag screens.                                                                                                                                                                               |

### Open (Phase 0 must ground these — need Arun)

| ID  | Assumption                                                                                | Why it is **not** grounded yet                                                         | What grounds it                                                                      |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| O1  | We know the **exact packet** this team files today.                                       | We have the public VPAT/TT story, not _their_ template.                                | Sample of last docket / ACR / SCRT export, or “we have nothing, start from TT rows.” |
| O2  | We know **who must sign** (Trusted Tester? product owner? both?).                         | Agency rules differ.                                                                   | One sentence: who signs, and whether TT certification is required.                   |
| O3  | We know the **first product** (URL, auth, in-scope flows).                                | Promised for later — correct, but Phase 1 cannot start without it.                     | Project name, URL(s), test account **channel** (not the password in git), 3–7 flows. |
| O4  | Extra engines (contrast, keyboard) will be **accepted as evidence** by _their_ reviewers. | Public process allows alternates with proof. Their reviewer may still say “ANDI only.” | Who reviews the pack; “ANDI required / extras allowed.”                              |
| O5  | Filling the pack will **cut hours** on this team.                                         | Pain is stated; we have not watched a real cycle.                                      | After they send the current process: how long a docket takes today.                  |
| O6  | Name **Docket** is final.                                                                 | Working title only.                                                                    | Keep / change.                                                                       |
| O7  | Publish of andi-cli (npm / image) is in or out of this program.                           | Separate launch leftover.                                                              | “Publish first” vs “Docket first” vs “parallel.”                                     |

## Phase 0 plan (do this, in order)

1. Freeze the seven-piece table (above) — edit only if Arun strikes a piece.
2. Fill O1–O7 as facts arrive. Do not invent the site or the template.
3. Produce an **empty pack mock** (headings only) so the gate is visual.
4. Stop. Phase 1 does not start until the gate passes **and** O3 is filled
   enough to log in and walk one flow.

## Need from Arun (Phase 0)

**Required before Phase 1** (can be partial for the Phase 0 _gate_):

- O1 — What do you file today? (file, screenshot, or “nothing — use TT rows”)
- O2 — Who signs?
- O6 — Keep the name Docket?
- O7 — Publish andi-cli now, or Docket first?

**Required before Phase 1 starts** (you said later — that is fine):

- O3 — Project name, site URL(s), how we get a test user, 3–7 flows
- O4 — Will reviewers accept non-ANDI evidence in the same pack?
- O5 — Rough hours to assemble a docket today (even “about two days”)

Do **not** put passwords in the repo or in chat if it will be logged.
Say how we will receive them (CI secret, local env, password manager).

## Need from no one else

Public process (G1–G4) is already sourced. Engine proof (G5) is already
in `docs/validation/launch-parity-2026-09-16.md`.
