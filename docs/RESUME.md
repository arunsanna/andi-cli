# Resume — andi-cli (checkpoint 2026-06-21)

> **Read this first to continue.** Then `docs/ARCHITECTURE.md` (decisions), `docs/PLAN.md`
> (phased plan — each phase has a Phase Contract), and the AI Memory board `andi-cli`
> (AC-001…005). Run `npm run test:fixture` to see the v0.1 scanner working.

## Where we are

Planning + Phase-0 grounding are **done and committed**. **No product code (`src/` features)
built yet** — held until the GitHub fork. The plan was independently graded **5.8 → 8.2 → ~9**
after closing review gaps.

## Proven by spikes (committed)

- Hermetic offline run: **0 external requests + output parity** (`spikes/04-hermetic-vendor.cjs`).
- `AndiModule.launchModule()` drives modules; **DOM-primary** extraction is correct, internal
  `andiAlerter` is an unreliable transient buffer (`spikes/05-extraction-source.cjs`).
- ANDI = **Apache-2.0** (`github.com/SSAgov/ANDI`); the fork carries every asset.

## Methodology now in force

Every phase is a **Phase Contract**: grounded entry (assumptions→facts via spikes) → build →
measured exit (run the entry-defined evals + **BASSPC self-review** + Definition of Done +
failure path). **Uniform gates** — no size-based passes. Encoded globally in the
`skill-writing-plans` skill (research-lab `c8e2b15`).

## Git state

- `andi-cli` `main` is **7 commits ahead of `origin` — NOT pushed** (local only). HEAD: `56829f5`.
- Working tree **clean**.
- Skill change committed in `research-lab` `c8e2b15` (propagates to all runtimes via symlinks).

## Next actions (in order)

1. **[USER] GitHub fork** of `SSAgov/ANDI` → rename to `andi-cli` → `git remote add upstream …`
   → merge so `andi/` exists. (Phase 0 entry; irreversible → user action.)
2. **[AGENT] Phase 1 entry-grounding spikes** — the Phase 1 contract blocks the build until these
   pass; both runnable against a `SSAgov/ANDI` clone before the fork:
   - **CSP:** prove `bypassCSP: true` lets ANDI inject on a page with a restrictive CSP.
   - **Modules `s/h/i`:** prove structures/hidden/iframes launch + produce findings
     (only `f/c/t/g/l` proven so far).
3. **[AGENT] Build Phase 1** subagent-driven per `docs/PLAN.md`, task-by-task, contract-gated.

## Open decisions when resuming

- Execution mode: subagent-driven (recommended) vs inline.
- Push `main` to `origin`? (Not done yet — was local-only at checkpoint.)
