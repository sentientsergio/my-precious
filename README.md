<p align="center">
  <img src="assets/smeagol.png" alt="my precious" width="680">
</p>

# my-precious

**`my-precious` compiles a prompt into a re-runnable workflow.** You write a prompt; it emits the workflow JavaScript that executes it, on Claude Code's runtime; you run that same artifact against context after context.

### Usage
`/my-precious <prompt.md> <context>`

### Three things
- **`prompt.md` is source.** It states a goal and, to whatever degree it likes, a workflow — anywhere from a bare problem to a fully prescribed pipeline.
- **The workflow `.js` is the compiled artifact** — a first-order deliverable that runs on Claude Code's existing dynamic-workflow runtime. `my-precious` never builds a runtime; it emits code for the one already here.
- **`<context>` is runtime input.** One binary, many contexts. Context never touches compilation.

### The compile
Recover the workflow latent in the prompt — honor whatever it prescribes, synthesize the rest — and emit the workflow that executes it.

**The membrane — the prompt is authoritative over everything it states; the compiler owns its silences:**
- Every instruction a stage receives is **quoted** from `prompt.md`, never paraphrased — goal, constraint, or prescribed orchestration alike.
- Where the prompt is silent, the compiler supplies the how via three verbs — **partition, sequence, resource.** It fills gaps; it never overrides what's stated and never authors content.
- Prescriptiveness is just how much the prompt states. A fully prescribed prompt leaves the compiler only plumbing; a bare problem leaves it the whole decomposition. One law throughout. Model selection is the compiler's optimization pass, read off each stage's semantics, only over stages the prompt didn't already tier.

### Auto-make
- The artifact is written beside the prompt (`prompt.md` → `prompt.workflow.js`), a hash embedded in its header.
- The hash covers `prompt.md` **and** `my-precious`'s own version.
- On invocation: hash matches → run; missing or stale → recompile → run.
- The `.js` is always regenerable and never hand-edited. `prompt.md` is the single source of truth.

### Diagnostics
Compilation may report a fixable weakness in the prompt, or the per-stage model choices it made. These surface to you — optionally as proposed edits to `prompt.md` — never written into the regenerable `.js`.
