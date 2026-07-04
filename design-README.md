**[design.md](design.md) is written — 488 lines, red-teamed, all findings fixed.** It carries the my-precious commission from the README's define phase to an implementable design, with the specimen compiled on paper as the acceptance reference.

**What the design settles.** The architecture is five components: `SKILL.md` (auto-make and run loop), a per-compile compiler subagent (the only place semantic judgment enters), two small scripts (`emit.mjs` copies prompt bytes into the artifact so the model never retypes source text; `check.mjs` runs ten deterministic gates), and the emitted `prompt.workflow.js`. The load-bearing decisions, each with rationale in the doc:

- **The membrane is made checkable, not aspirational** (§4): instruction text reaches stages only as byte-verified spans from `prompt.md`; compiler-authored text is confined to a closed plumbing grammar; a coverage matrix blocks emission if any instruction span routes nowhere.
- **Content flows through files, control flows through returns** (D2) — forced by the runtime's no-filesystem rule for scripts, and conveniently identical to the specimen's own handoff law.
- **"Main context" lowers to coordinator agents inside the workflow** (D3), at parent tier by identity — the artifact stays self-contained and re-runnable.
- **Mid-pipeline user interaction becomes pause/resume boundaries** (§6): the workflow returns `needs_user`, the session asks, and re-invocation with `resumeFromRunId` replays completed stages from cache. This resolves the one construct a background artifact cannot contain.
- A **15-row lowering catalog** (§5) maps every construct the specimen exercises — declared parallelism, prescribed batching, verbatim payload injection, name-blind data stripping, conditional stops, persona-styled progress — with a universal fallback so the compiler never paraphrases and never refuses.

Section 11 compiles `staker.md` on paper: all 18 steps plus the micro-stages, two interaction boundaries, and the `parent`/`fast` tier mapping — demonstrating the README's claim that a fully prescribed prompt leaves the compiler only plumbing. Section 12 gives the build order, starting with five runtime probes (P1–P5) that verify the design's stated assumptions before anything else is built.

**Ship-proposal package** (per the engineering discipline):

- _Findings:_ the red-team pass produced 8 findings (2 high, 2 medium, 4 low), reported in full above. The high pair: the syntax-check gate as first drafted would have rejected every valid artifact (top-level `return` vs `export` — no standalone parse mode accepts both), and the catalog was missing the "content read by main context, passed in prompt" lowering the specimen depends on in Steps 9 and 18.
- _Fix delta:_ all 8 fixed in the one permitted iteration — the wrapped-body syntax check, new catalog row 14 with a `P.embed` plumbing primitive, the main-context-tier-by-identity rule (with §11's tier column corrected), Probe P5 for meta-parser tolerance, the compile-report handback contract, resume-id chaining, MP-W05 always reporting the tier mapping, and the cross-turn boundary state note.
- _Unfixed:_ none.
- _Proposal:_ design.md is ready for your read as the design-phase deliverable. If it passes your verdict, the natural next commission is implementation step 1 — the runtime probes P1–P5 — since everything else in the build order keys off their results.
