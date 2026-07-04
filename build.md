# my-precious — build commission

**Phase:** implement. Upstream: [README.md](README.md) (define) → [design.md](design.md) (design, red-teamed, amendments applied 2026-07-04).
**Implementer profile:** written to be executed by a junior model (Sonnet 5) working under the engineer skill. The design carries the judgment; this commission carries the sequence. One work package has a senior gate (WP5).

## Mission

Build the system design.md specifies: the `/my-precious` skill, its two scripts, and the fixtures that prove them — culminating in a checked compile of the acceptance specimen. Produce nothing design.md does not name.

## Deliverables

```
SKILL.md                     auto-make + run loop + compiler-agent brief   (WP2)
VERSION                      starts 0.1.0                                  (WP0)
scripts/emit.mjs             $SPAN resolution + header stamping            (WP1)
scripts/check.mjs            F1 gates                                      (WP1)
fixtures/                    passing artifact + one tripping variant/gate  (WP1)
test-specimen/smoke.md       ~15-line bare-goal prompt                     (WP2)
probes.md                    P1–P5 verdicts with evidence                  (WP0)
test-specimen/staker.workflow.js   committed as acceptance evidence        (WP5)
```

## Ground rules

1. **design.md is authoritative.** Decisions D1–D6, the §2 ABI freeze, the §4.3 plumbing grammar, and the §7 gates are settled. On any conflict or ambiguity between this commission, design.md, and observed runtime behavior: stop and surface. Do not improvise design.
2. **Probe-first.** No package before WP0 completes. A probe that contradicts a §2 row produces a design-errata commit editing that row and its stated fallback — nothing more.
3. **Engineer discipline applies**: one package at a time; commit at the package boundary (`git init` this repo in WP0 — it is not yet a repository); verify before claim — every definition of done below is a runnable check, not a self-report; red-team the package artifact at completion, one fix iteration.
4. **The plumbing grammar is frozen.** If an emitted artifact seems to need a primitive §3.3 lacks, that is a version-change decision for the principal — escalate, don't extend.
5. **Throwaways live in the scratchpad.** The repo receives only the deliverables named above.
6. **No full staker execution** (live-web, 18 steps) without explicit principal approval — compile-only is the acceptance bar (design §12 step 6).

## Work packages

**WP0 — Scaffold and probes.** `git init`; write `VERSION` (0.1.0). Run probes P1–P5 exactly as design §2 states them, via throwaway workflows in the scratchpad. Record each verdict in `probes.md`: probe id, question, verdict (confirmed / fallback-triggered), evidence (transcript excerpt or run id). Apply errata per ground rule 2.
*Done when:* five verdicts recorded with evidence; design §2 edited or confirmed untouched; committed.

**WP1 — emit.mjs, check.mjs, fixtures.** Implement per design §3 (artifact anatomy, header, islands), §7 (gate list, including the gate-2 wrap transform), §9.1 (hash spec). Build a fixture suite: one minimal artifact that passes all gates, plus at least one tampered variant per gate that fails exactly that gate (design §12 step 2 names the starting set: bad hash, non-verbatim span, `Date.now`, long literal, bad meta).
*Done when:* the suite runs green from one command; each variant fails its intended gate and no other; committed.

**WP2 — SKILL.md and the smoke specimen.** Auto-make and compile-only mode per design §9.1; run loop per §9.2 (including resume-id chaining and cross-turn state); the compiler-agent brief distilled from design §§2–8 plus D1–D6 — self-contained, since it travels inside the compile prompt. The brief states that the compiler agent inherits the session model and stamps `compiled-by` (D1). Author `test-specimen/smoke.md`: a bare goal, no prescribed orchestration, cheap to run. Then compile it (compile-only mode).
*Done when:* smoke artifact passes `check.mjs` (A3); second invocation skips compilation (A1); touching smoke.md or VERSION triggers recompilation (A2); diagnostics render in chat and appear nowhere in the artifact (A7); committed.

**WP3 — Smoke end-to-end.** Run the smoke artifact with a trivial context; then again with a different context.
*Done when:* both runs return `complete` with an output file; the `.js` is byte-identical across the two runs — one binary, many contexts (A4); committed.

**WP4 — Boundary round-trip.** Add one interaction point to smoke.md (design §12 step 5); recompile; run.
*Done when:* the run pauses with `needs_user`, the answer resumes it via `resumeFromRunId`, and it completes (A5) — exercising P2 against reality; committed.

**WP5 — Staker acceptance (compile-only). SENIOR GATE.** Compile `test-specimen/staker.md`. Per design §12 step 6, this step runs from a senior-model session, or its coverage matrix and routing table go to a senior model for review before the package closes. A junior model does not self-certify this compile.
*Done when:* all gates pass on the staker artifact (A3); coverage matrix has zero unwaived orphans; stage shape matches design §11 within judgment; diagnostics ⊆ the §11 expected set (A6); senior review recorded in the commit message; artifact committed as acceptance evidence.

**WP6 — Diagnostics polish.** Proposed-edit formatting (quoted-original → proposed-replacement pairs) and MP-W08 detection, per design §10.
*Done when:* compile-only on a deliberately weakened smoke variant yields well-formed proposed edits; MP-W08 fires on a variant prescribing a write outside the run directory; committed.

## Acceptance map

A1, A2, A7 → WP2 · A3 → WP2/WP5 · A4 → WP3 · A5 → WP4 · A6 → WP5. All seven green closes the commission.

## Escalation triggers — stop and surface, don't route around

- A probe verdict that neither confirms §2 nor matches its stated fallback.
- Any gate found underspecified while implementing check.mjs.
- The staker compile still failing F-gates after the two permitted fix cycles (design §7).
- Any pull toward new plumbing vocabulary, a new envelope field, or reopening a D-decision.
- Runtime behavior that contradicts the §2 freeze in a way the errata protocol doesn't cleanly cover.

## Out of scope

Everything design §13 lists as a non-goal, verbatim. Additionally out of scope for this commission: running staker end-to-end (ground rule 6), packaging/distribution of the skill beyond this repo, and any edit to README.md.
