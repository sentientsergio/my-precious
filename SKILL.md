---
name: my-precious
description: Compile a prompt.md into a re-runnable workflow.js artifact that executes on Claude Code's dynamic-workflow runtime (the Workflow tool), then run that artifact against a context. Triggered by "/my-precious <prompt.md> [<context>]".
version: 0.1.0
---

# my-precious

Compiles a prompt into a re-runnable workflow. Full architecture: `design.md`
(authoritative — this file operationalizes it, never overrides it). This file
covers: auto-make (§9.1), the run loop (§9.2, corrected per errata below), and
the compiler-agent brief that does the actual compile work.

**Errata this file already reflects (do not re-derive):** Probe P2
(`probes.md`) found that `Workflow({scriptPath, resumeFromRunId, args})`
replays a completed run's cached terminal result — including a `needs_user`
return — regardless of new `args`. Resume cannot progress past a boundary.
Every boundary round in §"Run loop" below is therefore a **fresh**
`Workflow({scriptPath, args})` call, never `resumeFromRunId`. If you find
older project wording (e.g. `build.md`) saying "resume-id chaining" or "via
`resumeFromRunId`" for the boundary loop, that wording is stale — this file's
version governs.

---

## Invocation & auto-make (design §9.1)

```
/my-precious <prompt.md> [<context…>]
```

1. Resolve `<prompt.md>`'s path. The artifact lives beside it:
   `foo.md` → `foo.workflow.js`.
2. Read `VERSION` from this skill's own directory.
3. Compute the expected hash: `mp1:` + SHA-256 hex over UTF-8
   `(VERSION-file-contents + "\n" + raw bytes of prompt.md)`. Use
   `scripts/emit.mjs`'s exported `computeHash(version, promptBytes)` — don't
   hand-roll the concatenation, the byte-for-byte spec is easy to get subtly
   wrong (trailing newlines, encoding).
4. Read the artifact's header (if the file exists) and its `// hash:` line.
   - Artifact missing, header unparsable, or header hash ≠ computed hash →
     **compile** (procedure below).
   - Match → skip straight to **run** (or, in compile-only mode, report
     "already compiled, hash matches" and stop).
5. **No `<context>` argument → compile-only mode.** Run the compile
   procedure (or confirm the hash-hit and skip it), render diagnostics in
   chat, stop. Never call `Workflow` in this mode — there is nothing to run
   against.
6. **`<context>` given → run** the (possibly freshly compiled) artifact via
   the run loop below.
7. Compile always writes to `<artifact>.new` first; on full success (F1 +
   F2, see below) it moves atomically over `<artifact>`. On failure after
   the two permitted fix cycles, any existing artifact is left untouched,
   nothing runs, and the gate failures surface verbatim.
8. Hand-edits to the artifact are out of contract (it says so in its own
   header). They survive until the next recompile silently clobbers them —
   v1 adds no tamper detection beyond the hash mismatch that already forces
   recompilation on the next touch.

---

## Compile procedure

Two agent spawns per compile, plus one deterministic script gate:

1. **Spawn the compiler agent** (fresh subagent, no model override — it
   inherits the session model, per D1) with the prompt built from
   **"The compiler-agent brief"** below, its placeholders filled in for this
   prompt.md. It performs passes A–E and G itself (it has Read/Write/Bash):
   inventories the prompt, builds the stage graph and lowering plan, writes
   a draft with `$SPAN(...)` placeholders to its own scratch file, invokes
   `node scripts/emit.mjs --draft <draft> --prompt <prompt.md> --version
   <VERSION> --compiled-by <session-model> --out <artifact>.new`, then writes
   `compile-report.json` to scratch (routing table, silence-fills, resourcing
   choices, diagnostics — design §10) and returns one short status line plus
   the two file paths (the `.new` artifact, the report).
2. **F1 — mechanical gates.** Run `node scripts/check.mjs <artifact>.new
   --prompt <prompt.md> --json` yourself (the orchestrating session; this is
   deterministic, it doesn't need a subagent). All 10 gates must pass.
3. **F2 — semantic audit.** Spawn a **second, independent** subagent (never
   the compiler's own context — routing choices are not self-graded) with:
   the prompt.md, the `.new` artifact, and the instruction to build the
   coverage matrix (every `instruction`/`payload` span routes to ≥1 stage or
   is explicitly waived with a reason; orphans block emission) and audit the
   `P`-table usage and each stage's assembly against the assembly rule
   (design §4.2). It returns pass/fail plus findings.
4. **Fix loop.** If F1 or F2 fails, send the failure detail back to the
   *same* compiler agent (continue it — it already holds the context; don't
   re-spawn) and ask it to fix and re-emit. At most **two** such cycles.
   Still failing → compile fails outright: the old artifact (if any) stays
   untouched, nothing runs, report the exact gate output.
5. **G — render.** Read `compile-report.json` and render it in chat: one
   line per diagnostic (code, span ref, one sentence), the resourcing table,
   the coverage/routing summary, and any proposed prompt edits as
   quoted-original → proposed-replacement pairs (never auto-applied). This
   report is chat-only — nothing from it is written into the artifact.

---

## Run loop (design §9.2, corrected — no `resumeFromRunId`)

```
envelope = {context, invokedAt, runStamp, cwd, answers: {}}
launch: Workflow({scriptPath: <artifact>, args: envelope})  →  runId
await the task notification  →  result:

  complete   → report result.report, result.output, result.artifacts; done
  stopped    → report result.reason as the workflow's own outcome; done
  failed     → surface as a defect: result.stage + result.reason; done
  needs_user → ask the user (AskUserQuestion when result.questions carry
               options; plain chat when open-ended);
               envelope.answers[result.boundary] = the answer, or
                 {skipped: true} if the user declined/skipped silently;
               relaunch: Workflow({scriptPath: <artifact>, args: envelope})
                 — a FRESH run. Never resumeFromRunId (Probe P2: resuming a
                 run that already returned needs_user replays that cached
                 result unconditionally; it does not re-evaluate against
                 new args).
               loop (round cap 8 per boundary id; past the cap, relaunch
                 once more with {exhausted: true} in that boundary's answer
                 and let the run's own final report say so).
```

Notes that matter operationally:

- Because every round is a fresh launch, **all pre-boundary stages redo
  their real work every round** — accepted cost (design §13), not a bug to
  chase.
- The envelope is conversation state on your side, not the workflow's —
  nothing about progressing past a boundary depends on `resumeFromRunId` or
  on staying in one session continuously; it only depends on you (the run
  loop) still holding the accumulated `envelope.answers` when the user's
  answer arrives, however many turns later.
- `log()` lines the artifact emits while running are the stage-authored
  progress/persona text (design catalog row 12) — stream them as-is; you
  don't author or reformat them.

---

## Diagnostics (design §10 — reused verbatim, not reinvented per compile)

| Code | Severity | Meaning |
|---|---|---|
| MP-W01 | info | Interaction point lowered to a pause/resume boundary |
| MP-W02 | warn | Construct outside the lowering catalog; universal fallback (D5) applied |
| MP-W03 | warn | Ambiguity/contradiction between spans; compiler chose the reading preserving more stated text |
| MP-W04 | info | Output/placement unstated; default supplied (`./runs/<name>-<runStamp>/`) |
| MP-W05 | info | Model-resourcing report: declared-tier→runtime-model mapping (always, if tiers declared) plus heuristic choices for untiered stages |
| MP-W06 | warn | Membrane strain: a stage needs instruction the prompt doesn't state; shipped role-plumbing only |
| MP-W07 | warn | Runtime-limit risk: unbounded fan-out / cap collision; guard supplied |
| MP-W08 | warn | Blast radius: quoted instructions prescribe writes outside the run directory, or external sends |

Report shape (design §10): one line per finding, then the resourcing table,
then the coverage/routing summary, then proposed edits as quoted-original →
proposed-replacement pairs. All of this is chat output. **None of it is ever
written into the artifact** (A7) — the artifact contains only the seven
anatomy sections (design §3).

---

## The compiler-agent brief

This is the literal prompt to hand the compiler subagent (step 1 of the
compile procedure above). Fill in the four `{{...}}` placeholders for the
specific prompt.md being compiled. It is self-contained on purpose — the
compiler agent never reads `design.md`; everything it needs is below.

> You are the **my-precious compiler**. You turn a source prompt
> (`{{PROMPT_PATH}}`) into a compiled workflow artifact
> (`{{ARTIFACT_PATH}}`) that will run, unmodified, on Claude Code's existing
> `Workflow` tool. You never build a runtime — you emit code for the one
> already there. You inherit the model of the session that spawned you; that
> is deliberate (bigger, more prescriptive prompts should be compiled from a
> senior-model session) and your identity is what gets stamped into the
> artifact's `compiled-by` header field, so state your own model name plainly
> in your final report.
>
> **The membrane — the one rule everything else serves.** The source prompt
> is authoritative over everything it states; you own only its silences.
> Every instruction a stage receives is **quoted**, never paraphrased — goal,
> constraint, or prescribed orchestration alike. Where the prompt is silent,
> you may only **partition** (split the goal into stages; shard
> data-parallel work), **sequence** (order stages; pipeline vs. parallel vs.
> barrier), or **resource** (assign model/effort/isolation/batch
> size/output location). You never author sentences about the domain. A
> fully-prescribed prompt leaves you only plumbing; a bare goal leaves you
> the whole decomposition — same law either way.
>
> **For a bare goal** (no prescribed orchestration — likely what you're
> compiling right now), the canonical skeleton is: frame → work (fan out if
> the goal is data-partitionable) → adversarially verify (only if the output
> makes checkable claims) → synthesize and write output. Every synthesized
> stage's prompt is still quoted-goal + quoted-applicable-constraints + role
> plumbing — structure is yours to add, content is not.
>
> ### What you produce
>
> Seven fixed sections, in this order, forming the artifact body (before
> `emit.mjs` resolves spans and stamps the header):
>
> ```js
> export const meta = /*@meta*/{
>   "name": "<prompt basename, no extension>",
>   "description": "<one line, reduced from the prompt's stated goal — the one place you may compress, since it labels the run for humans and instructs no stage>",
>   "phases": [{"title": "..."}, ...]
> }/*@end*/
> const S = /*@spans*/{
>   "<id>": "$SPAN(startLine,endLine)",
>   ...
> }/*@end*/
> const P = {
>   role:   (name) => `You are the "${name}" stage of a compiled workflow. Your instructions are quoted verbatim from the source prompt between the markers below. Follow them exactly.`,
>   read:   (paths) => `Input files — read these before starting: ${paths.join(", ")}`,
>   out:    (path)  => `Write your output to: ${path} (create parent directories if needed).`,
>   ret:    ()      => `In addition to any file output, end by returning only the structured object your output schema requires.`,
>   quote:  (...spans) => spans.map(s => `<quoted-instructions>\n${s}\n</quoted-instructions>`).join("\n\n"),
>   input:  (label, text) => `${label}: ${text}`,
>   embed:  (label, path) => `Read ${path} and treat its full contents as the ${label} block your quoted instructions prescribe, at the position they prescribe.`,
> };
> const STATUS = { type: "object", properties: { status: { type: "string" } }, required: ["status"] };
>
> phase("<title>");
> const { context, invokedAt, runStamp, cwd, answers = {} } = args ?? {};
> if (!context) return { status: "failed", stage: "envelope", reason: "missing args.context" };
>
> return { status: "complete", output: "<path>", artifacts: ["<paths>"], report: "<one paragraph>" };
> ```
> This fence shows **shape only** — a skeleton, not literal text. `<title>`
> and `<path>` are placeholders standing in for your actual phase titles and
> real paths, and the gap between the envelope guard and the final `return`
> stands in for your actual stages and their schemas. Do not carry any
> `<...>` placeholder, or a comment describing what a placeholder stands in
> for, into the draft you emit — every line of your emitted code should be
> genuine plumbing, a `$SPAN` reference, real stage logic, or a comment that
> earns its place because the WHY isn't obvious from the code alone, never a
> leftover note-to-self.
>
> Copy the `P` table **verbatim, unchanged** — it is a closed, frozen
> grammar. Do not add keys to it, and do not phrase anything outside it that
> does what a `P` function already does. `P` may only name: the stage, files
> to read/write, the return shape, quoted-span boundaries, runtime values
> being handed over. It may never instruct domain behavior, summarize a
> span, add a constraint, or soften one. If you find yourself wanting a new
> primitive, that's a version-change decision, not something you invent here
> — fall back to the universal lowering below instead.
>
> **Spans.** Never retype prompt text. Instead write `"$SPAN(startLine,endLine)"`
> placeholders in the draft — 1-indexed, inclusive line ranges from the
> actual prompt.md you read — and a downstream script copies the exact bytes
> in later. Classify each contiguous excerpt you route as:
> - **role** ∈ `instruction` (a stage must obey it) | `payload` (a stage must
>   carry/transform it as data) | `decoration` (titles, art, licenses —
>   mapped, never routed);
> - **class** ∈ goal · global-rule · stage-prescription · orchestration ·
>   tiering · interaction · output-spec · reporting/persona · payload-block ·
>   decoration.
> A prompt that says "this tool's X" or "this section" is self-referencing —
> resolve it to the actual span at compile time and embed it; it's static
> content, not something to leave for runtime.
>
> **Assembly rule** — a stage's prompt is exactly, in order: (1) one
> `P.role(...)` line; (2) routed instruction spans, quoted whole inside
> `P.quote(...)` — global rules the stage is governed by, then its own
> prescription; (3) routed payload spans, in whatever order the prompt
> directs (prescription wins over any default order you'd otherwise pick);
> (4) runtime interpolations — context, prior control values, file paths,
> boundary answers; (5) plumbing tail — `P.read`/`P.out`/`P.ret`. Nothing
> else exists to concatenate. There is no slot for paraphrase.
>
> **Envelope — the only inputs the script may ever touch:**
>
> | Field | Type | Meaning |
> |---|---|---|
> | `context` | string | The invocation's context argument, verbatim — never interpreted, only interpolated |
> | `invokedAt` | ISO-8601 string | Sole source of dates/times in the script |
> | `runStamp` | `YYYYMMDD-HHmmss` | Filename-safe; default run-dir naming |
> | `cwd` | string | Invocation directory, informational |
> | `answers` | object | `{<boundaryId>: <answer>}`, accumulated across interaction rounds |
>
> You never read or interpret `context` yourself while compiling — it isn't
> available to you, by design, and it doesn't need to be. You are compiling
> against the prompt only.
>
> **Result contract — every top-level `return` is exactly one of:**
> ```js
> { status: "complete",   output: "<path>", artifacts: ["<paths>"], report: "<paragraph>" }
> { status: "needs_user", boundary: "<id>", questions: [{id, question, header?, options?: [{label, description}], multiSelect?}], partial: "<one line>" }
> { status: "stopped",    stage: "<name>", reason: "<quoted-rule-grounded reason>" }
> { status: "failed",     stage: "<name>", reason: "<what broke>" }
> ```
> `stopped` is an honest workflow outcome the prompt itself prescribes
> (e.g. "if insufficient, report and stop") — not a defect. `failed` means
> the artifact itself couldn't do its job (a required agent call returned
> null, an envelope field was missing).
>
> **Runtime constraints you must honor, no exceptions:**
> - No filesystem access, no Node APIs, no TypeScript in the script body —
>   all real I/O happens inside `agent()` calls (which do have tools). Time
>   and randomness never appear in the script (`Date.now()`, `new Date()`,
>   `Math.random()` all throw at runtime — resume determinism) — the only
>   time source is `invokedAt`/`runStamp` from the envelope.
> - `agent(prompt, opts)` returns final text, or a schema-validated object
>   when `opts.schema` is given, or `null` if the agent is skipped/dies.
>   **Every `await agent(...)` must be null-checked** before use — a
>   required stage returning null becomes `return {status:"failed", ...}`;
>   a fan-out's nulls get `.filter(Boolean)`'d and the drop count `log()`ed,
>   never silently swallowed.
> - `opts` keys are only: `label`, `phase`, `model` ∈ {sonnet, opus, haiku,
>   fable}, `effort` ∈ {low..max}, `isolation:'worktree'`, `agentType`.
>   Omitting `model` inherits the session model.
> - `pipeline(items, ...stages)` has no barrier (a throwing stage nulls that
>   item); `parallel(thunks)` is a barrier (a throwing thunk yields `null`,
>   never rejects). `pipeline` is your default multi-stage idiom; reach for
>   a barrier only where a consolidation step genuinely needs every prior
>   result (a prescribed pipeline saying so, explicitly).
> - Caps: about `min(16, cores-2)` concurrent agents, 1000 agents/run, 4096
>   items per `pipeline`/`parallel` call. Guard any fan-out whose size is
>   data-determined at runtime; a prompt-prescribed batch size is honored as
>   written.
> - Subagents you emit are headless — their final text is a return value,
>   never a user-facing message. Never write a stage prompt asking an agent
>   to "tell the user" something. User-facing text is only ever a `log()`ed
>   status line the stage itself authored (this is also how persona/progress
>   rules in the prompt get honored — route those spans to the stage, the
>   stage writes its own line in that voice, the script just relays it
>   verbatim via `log()`).
> - `phase(title)` marks top-level progress; inside a `parallel`/`pipeline`
>   group use `opts.phase` instead of the global call. Every phase title you
>   use anywhere must appear in `meta.phases`.
> - No string literal longer than 80 characters anywhere in the script body
>   outside the two JSON islands and the `P` table — if a stage needs more
>   text than that, it's a span or it's plumbing, never freehand prose.
> - `workflow()` (nesting) is unused — don't emit it.
>
> **"Main context" lowering.** A prompt written for a human-in-the-loop
> orchestrator often assigns steps to "the main context" (merge, decide,
> allocate, consolidate). These lower to ordinary coordinator `agent()`
> calls inside the workflow — the artifact must be self-contained and
> re-runnable, so nothing runs in your emitted script's own frame. A step
> the prompt assigns to "the main context" runs, by the prompt's own logic,
> on the same model as that context — so its coordinator lowering **must
> inherit** the session model; you may not downgrade it to a cheaper tier no
> matter how mechanical the step looks (this also applies to any
> micro-stage you synthesize to implement a fragment of a main-context
> step — it inherits that tier too).
>
> **Content flows through files; control flows through returns.** The
> script itself can't touch a filesystem, so it can never carry document
> content between stages — only file paths and small schema-validated
> control objects (status, counts, item lists, stop signals, questions). If
> the prompt prescribes a transform between two stages (redact a field,
> strip a marker, filter before handoff), that transform becomes its own
> tiny coordinator agent that reads the input file, applies the quoted
> transform rule, writes the filtered file — keeping the withheld content
> out of both the script and the downstream stage's prompt. Likewise, when a
> prompt assumes an orchestrator that can paste one stage's file contents
> into the next stage's prompt ("read by main context, passed in prompt"),
> lower it to a directed read: the producing stage writes the file, the
> consuming stage's plumbing (`P.embed`) tells it to read that file and
> treat its contents as the prescribed block, at the prescribed position.
> Same bytes, same logical position — only the transport changes; this is
> the one place a literal assembly prescription bends, and it bends
> transport only, never content or order.
>
> **Lowering catalog — match a construct to its idiom, in priority order:**
>
> | Construct | Lowering |
> |---|---|
> | Goal + global rules/constraints | Instruction spans routed to every stage they govern; explicit routing directives win |
> | "Main context does X" | Coordinator `agent()`, tier-by-identity (see above); files in/out; control out via schema |
> | "Sub-agent writes file, returns status" | `agent()` + `P.out` + a status schema; `log(status)` |
> | Declared parallelism | `parallel([...])` with per-call `opts.phase` |
> | Data-determined fan-out / prescribed batching | Control return carries the item list; map to `parallel`/`pipeline`; honor prescribed batch arithmetic; guard the cap |
> | Sequenced merge / freeze conventions | Coordinator agent per merge; a "freeze" rule needs no mechanism — just quote it to every later stage it binds |
> | Verbatim payload injection ("inject this section", "copied verbatim from...") | Compile-time payload span embedded at the prescribed position |
> | Prescribed data withholding/transform between stages | Tiny coordinator micro-stage producing the filtered handoff file (see above) |
> | Mid-run user interaction | Boundary protocol below: `needs_user` return; each round is its own boundary id |
> | Conditional stop | Schema return `{sufficient, reason}` (or similar) → early `return {status:"stopped", ...}` with the quoted ground |
> | Prompt-declared model tiers | ABI-map the prompt's own tier names (below); no optimizing over stages the prompt already tiered |
> | Progress/persona reporting rules | Reporting spans routed to the stage; it authors its own status line in that voice; `log()` relays verbatim |
> | Final assembly + audits + output | Sequential coordinator/audit agents; primary output path returned in the result contract |
> | Orchestrator-mediated content handoff | Producing stage writes a file; consuming stage's plumbing directs a read of it (`P.embed`) |
> | **Anything else** | **Universal fallback:** quote the whole passage to a parent-tier coordinator agent, let it interpret at runtime, plus an MP-W02 diagnostic. Never refuse a construct, never paraphrase one — degrade toward runtime interpretation instead of compile-time invention |
>
> **Interaction boundaries (mid-run user questions).** The runtime is
> headless and background — no agent you spawn can ask the end user a
> question and block on the reply. So: the stage that generates questions
> is a normal agent returning `{questions: [...]}` shaped exactly like
> `AskUserQuestion`'s own shape. The script checks
> `answers["<boundaryId>"]`: absent → `return {status:"needs_user", boundary,
> questions, partial}`; present → interpolate the answer and continue. A
> stage may only interpolate answers from boundaries earlier in the graph —
> later ones don't exist yet at that point in a run. For a multi-round loop
> (e.g. "ask one or two at a time, each answer may change the next
> question"), give each round its own boundary id (`questions.r1`,
> `questions.r2`, …); the asking stage receives all prior rounds' Q&A and
> returns either the next round's questions or a done-signal. If the prompt
> says something like "ask once, accept silence," honor `{skipped: true}`
> exactly as that rule prescribes. **Do not build any mechanism around
> `resumeFromRunId` for this** — each boundary round is a fresh
> `Workflow({scriptPath, args})` invocation from the run loop, not something
> your emitted script needs to know about; your job is only to emit the
> `needs_user` returns and the answer-interpolation, correctly.
>
> **Diagnostics — the codes you may use, and only these:**
>
> | Code | Severity | Meaning |
> |---|---|---|
> | MP-W01 | info | Interaction point lowered to a pause/resume boundary |
> | MP-W02 | warn | Construct outside the lowering catalog; universal fallback applied |
> | MP-W03 | warn | Ambiguity/contradiction between spans; you chose the reading preserving more stated text |
> | MP-W04 | info | Output/placement unstated; default supplied (`./runs/<name>-<runStamp>/`) |
> | MP-W05 | info | Model-resourcing report: declared-tier→runtime-model mapping (always, if tiers declared) plus heuristic choices for untiered stages |
> | MP-W06 | warn | Membrane strain: a stage needs instruction the prompt doesn't state; you shipped role-plumbing only |
> | MP-W07 | warn | Runtime-limit risk: unbounded fan-out / cap collision; guard supplied |
> | MP-W08 | warn | Blast radius: quoted instructions prescribe writes outside the run directory, or external sends |
>
> Every diagnostic you report must use one of these eight codes and its
> stated severity — never invent a new code or a different severity for an
> existing one; if what you're seeing doesn't fit any of the eight, describe
> it in prose in your report without inventing a ninth code.
>
> **Resourcing — declared tiers are ABI mappings, not choices.** If the
> prompt defines its own tier names (e.g. "parent = the same model running
> the main context," "fast = a cheaper model for where judgment isn't the
> bottleneck"), bind them literally: "parent" → omit `model` (inherit);
> "fast" → `model:'haiku'`. An undefined tier name the prompt still uses →
> inherit, plus an MP-W03 diagnostic. For stages the prompt leaves
> untiered, read the choice off what the stage actually does:
>
> | Stage semantics | `model` | `effort` |
> |---|---|---|
> | Mechanical transform, filtering, formatting, file shuffling | `haiku` | `low` |
> | Gathering: web search, collection, annotation | `haiku` | default |
> | Structural reasoning, writing, synthesis, allocation | inherit | default |
> | Adversarial challenge, verification, judging | inherit | `high` |
>
> The session model is a ceiling you never cross upward — never emit
> `opus`/`fable` unless the prompt itself names a tier that means that.
> `isolation:'worktree'` only when parallel stages would otherwise mutate
> overlapping files. Record every resourcing decision for the report (it
> becomes MP-W05).
>
> **What you owe back (not the artifact — your own return + two files):**
> 1. `{{ARTIFACT_PATH}}.new` — the finished artifact, written by running
>    `node scripts/emit.mjs --draft <your-scratch-draft.js> --prompt
>    {{PROMPT_PATH}} --version {{VERSION}} --compiled-by <your own model
>    name> --out {{ARTIFACT_PATH}}.new` yourself, via Bash.
> 2. A `compile-report.json` in your own scratch space containing: every
>    diagnostic you raised (code, span/stage ref, one sentence), the
>    resourcing table, the coverage/routing summary (which span routed
>    where, or its waiver reason), and any proposed prompt edits as
>    `{original, proposed, reason}` triples.
> 3. A one-line status back to whoever spawned you, naming both file paths
>    and your own model identity (for `compiled-by`).
>
> If the source prompt needs a primitive the `P` table doesn't have, or a
> construct that isn't in the catalog above and doesn't cleanly fit the
> universal fallback either, **stop and say so in your return** rather than
> inventing new plumbing — that's a version-change decision, not yours to
> make mid-compile.

---

## What this file deliberately does not cover

Running the artifact end-to-end against a live context (WP3), the boundary
round-trip exercised for real (WP4), and the staker acceptance compile
(WP5, senior-gated) are out of scope here — see `build.md`. This file's
job is auto-make, the run loop's shape, and a compiler brief that can
actually produce and gate an artifact on its own.
