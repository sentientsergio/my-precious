// my-precious artifact — regenerable; do not hand-edit. Edit the source prompt and re-invoke /my-precious.
// source: SKILL.md
// my-precious-version: 0.1.1
// compiled-by: fable-5
// hash: mp1:b3b2ad25ff524a8d0d909a3b5dc96c640b044e7bedf56a62c3e95416921c87b2
export const meta = /*@meta*/{
  "name": "SKILL",
  "description": "Compile a prompt.md into a hash-checked, gated, re-runnable workflow.js artifact: auto-make, compiler agent, F1 gates, F2 audit, bounded fix loop.",
  "phases": [{"title": "Auto-make"}, {"title": "Compile"}, {"title": "Verify"}, {"title": "Finalize"}]
}/*@end*/
const S = /*@spans*/{
  "automake": "## Invocation & auto-make (design §9.1)\n\n```\n/my-precious <prompt.md> [<context…>]\n```\n\n1. Resolve `<prompt.md>`'s path. The artifact lives beside it:\n   `foo.md` → `foo.workflow.js`.\n2. Read `VERSION` from this skill's own directory.\n3. Compute the expected hash: `mp1:` + SHA-256 hex over UTF-8\n   `(VERSION-file-contents + \"\\n\" + raw bytes of prompt.md)`. Use\n   `scripts/emit.mjs`'s exported `computeHash(version, promptBytes)` — don't\n   hand-roll the concatenation, the byte-for-byte spec is easy to get subtly\n   wrong (trailing newlines, encoding).\n4. Read the artifact's header (if the file exists) and its `// hash:` line.\n   - Artifact missing, header unparsable, or header hash ≠ computed hash →\n     **compile** (procedure below).\n   - Match → skip straight to **run** (or, in compile-only mode, report\n     \"already compiled, hash matches\" and stop).\n5. **No `<context>` argument → compile-only mode.** Run the compile\n   procedure (or confirm the hash-hit and skip it), render diagnostics in\n   chat, stop. Never call `Workflow` in this mode — there is nothing to run\n   against.\n6. **`<context>` given → run** the (possibly freshly compiled) artifact via\n   the run loop below.\n7. Compile always writes to `<artifact>.new` first; on full success (F1 +\n   F2, see below) it moves atomically over `<artifact>`. On failure after\n   the two permitted fix cycles, any existing artifact is left untouched,\n   nothing runs, and the gate failures surface verbatim.\n8. Hand-edits to the artifact are out of contract (it says so in its own\n   header). They survive until the next recompile silently clobbers them —\n   v1 adds no tamper detection beyond the hash mismatch that already forces\n   recompilation on the next touch.",
  "compileSpawn": "## Compile procedure\n\nTwo agent spawns per compile, plus one deterministic script gate:\n\n1. **Spawn the compiler agent** (fresh subagent, no model override — it\n   inherits the session model, per D1) with the prompt built from\n   **\"The compiler-agent brief\"** below, its placeholders filled in for this\n   prompt.md. It performs passes A–E and G itself (it has Read/Write/Bash):\n   inventories the prompt, builds the stage graph and lowering plan, writes\n   a draft with `$SPAN(...)` placeholders to its own scratch file, invokes\n   `node scripts/emit.mjs --draft <draft> --prompt <prompt.md> --version\n   <VERSION> --compiled-by <session-model> --out <artifact>.new`, then writes\n   `compile-report.json` to scratch (routing table, silence-fills, resourcing\n   choices, diagnostics — design §10) and returns one short status line plus\n   the two file paths (the `.new` artifact, the report).",
  "f1": "2. **F1 — mechanical gates.** Run `node scripts/check.mjs <artifact>.new\n   --prompt <prompt.md> --json` yourself (the orchestrating session; this is\n   deterministic, it doesn't need a subagent). All 10 gates must pass.",
  "f2": "3. **F2 — semantic audit.** Spawn a **second, independent** subagent (never\n   the compiler's own context — routing choices are not self-graded) with:\n   the prompt.md, the `.new` artifact, and the instruction to build the\n   coverage matrix (every `instruction`/`payload` span routes to ≥1 stage or\n   is explicitly waived with a reason; orphans block emission) and audit the\n   `P`-table usage and each stage's assembly against the assembly rule\n   (design §4.2). It returns pass/fail plus findings.",
  "fixloop": "4. **Fix loop.** If F1 or F2 fails, send the failure detail back to the\n   *same* compiler agent (continue it — it already holds the context; don't\n   re-spawn) and ask it to fix and re-emit. At most **two** such cycles.\n   Still failing → compile fails outright: the old artifact (if any) stays\n   untouched, nothing runs, report the exact gate output.",
  "render": "5. **G — render.** Read `compile-report.json` and render it in chat: one\n   line per diagnostic (code, span ref, one sentence), the resourcing table,\n   the coverage/routing summary, and any proposed prompt edits as\n   quoted-original → proposed-replacement pairs (never auto-applied). This\n   report is chat-only — nothing from it is written into the artifact.",
  "diagTable": "## Diagnostics (design §10 — reused verbatim, not reinvented per compile)\n\n| Code | Severity | Meaning |\n|---|---|---|\n| MP-W01 | info | Interaction point lowered to a pause/resume boundary |\n| MP-W02 | warn | Construct outside the lowering catalog; universal fallback (D5) applied |\n| MP-W03 | warn | Ambiguity/contradiction between spans; compiler chose the reading preserving more stated text |\n| MP-W04 | info | Output/placement unstated; default supplied (`./runs/<name>-<runStamp>/`) |\n| MP-W05 | info | Model-resourcing report: declared-tier→runtime-model mapping (always, if tiers declared) plus heuristic choices for untiered stages |\n| MP-W06 | warn | Membrane strain: a stage needs instruction the prompt doesn't state; shipped role-plumbing only |\n| MP-W07 | warn | Runtime-limit risk: unbounded fan-out / cap collision; guard supplied |\n| MP-W08 | warn | Blast radius: quoted instructions prescribe writes outside the run directory, or external sends |\n\nReport shape (design §10): one line per finding, then the resourcing table,\nthen the coverage/routing summary, then proposed edits as quoted-original →\nproposed-replacement pairs. All of this is chat output. **None of it is ever\nwritten into the artifact** (A7) — the artifact contains only the seven\nanatomy sections (design §3).",
  "briefIntro": "## The compiler-agent brief\n\nThis is the literal prompt to hand the compiler subagent (step 1 of the\ncompile procedure above). Fill in the four `{{...}}` placeholders for the\nspecific prompt.md being compiled. It is self-contained on purpose — the\ncompiler agent never reads `design.md`; everything it needs is below."
}/*@end*/
const P = {
  role:   (name) => `You are the "${name}" stage of a compiled workflow. Your instructions are quoted verbatim from the source prompt between the markers below. Follow them exactly.`,
  read:   (paths) => `Input files — read these before starting: ${paths.join(", ")}`,
  out:    (path)  => `Write your output to: ${path} (create parent directories if needed).`,
  ret:    ()      => `In addition to any file output, end by returning only the structured object your output schema requires.`,
  quote:  (...spans) => spans.map(s => `<quoted-instructions>\n${s}\n</quoted-instructions>`).join("\n\n"),
  input:  (label, text) => `${label}: ${text}`,
  embed:  (label, path) => `Read ${path} and treat its full contents as the ${label} block your quoted instructions prescribe, at the position they prescribe.`,
};
const STATUS = { type: "object", properties: { status: { type: "string" } }, required: ["status"] };

const AUTOMAKE_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    version: { type: "string" },
    expectedHash: { type: "string" },
    artifactExists: { type: "boolean" },
    hashMatch: { type: "boolean" }
  },
  required: [...STATUS.required, "version", "expectedHash", "hashMatch"]
};

const COMPILE_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    draftPath: { type: "string" },
    artifactNewPath: { type: "string" },
    reportPath: { type: "string" },
    compiledBy: { type: "string" }
  },
  required: [...STATUS.required, "draftPath", "artifactNewPath", "reportPath", "compiledBy"]
};

const F1_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    overallPass: { type: "boolean" },
    gates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "number" },
          name: { type: "string" },
          pass: { type: "boolean" },
          detail: { type: "string" }
        },
        required: ["n", "pass"]
      }
    }
  },
  required: [...STATUS.required, "overallPass", "gates"]
};

const F2_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    pass: { type: "boolean" },
    findings: { type: "array", items: { type: "string" } }
  },
  required: [...STATUS.required, "pass", "findings"]
};

const DIAG_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    moved: { type: "boolean" },
    diagnostics: { type: "array", items: { type: "object" } },
    resourcing: { type: "array", items: { type: "object" } },
    coverage: { type: "string" },
    proposedEdits: { type: "array", items: { type: "object" } }
  },
  required: [...STATUS.required, "moved", "diagnostics", "coverage"]
};

phase("Auto-make");
const _args = typeof args === "string" ? JSON.parse(args) : (args ?? {});
const { context, invokedAt, runStamp, cwd, answers = {} } = _args;
// The SKILL.md invocation grammar has two positionals: <prompt.md> [<context>]
// but the envelope has one free slot; the prompt path rides as an extension
// field, with context as fallback so a five-field envelope still works.
const promptPath = _args.promptPath ?? context;
if (!promptPath) {
  return { status: "failed", stage: "envelope", reason: "missing promptPath in envelope" };
}
const artifactPath = promptPath.replace(/\.md$/, ".workflow.js");
if (artifactPath === promptPath) {
  return { status: "failed", stage: "envelope", reason: "prompt path must end in .md" };
}
// Compile-time resolution of the self-reference in the prompt to the skill
// home directory (VERSION, scripts/emit.mjs, scripts/check.mjs live there).
const SKILL_DIR = "/Users/sergio/sentientsergio/my-precious";
const runDir = `${cwd}/runs/SKILL-${runStamp}`;
// The run loop (launching the compiled artifact, mediating boundaries) is
// session-surface; a background artifact cannot lower it. Note it instead.
const runRequested = Boolean(_args.promptPath && context);
const runWallNote = runRequested
  ? " Run loop not lowered (session-surface); launch runs from the session."
  : "";

const auto = await agent([
  P.role("auto-make hash check"),
  P.quote(S.automake),
  P.input("prompt.md path", promptPath),
  P.input("artifact path beside it", artifactPath),
  P.input("skill directory holding VERSION and scripts", SKILL_DIR),
  P.ret(),
].join("\n\n"), { schema: AUTOMAKE_SCHEMA, label: "auto-make" });
if (!auto) {
  return { status: "failed", stage: "auto-make", reason: "auto-make agent returned null" };
}
log(auto.status);
if (auto.hashMatch) {
  return {
    status: "complete",
    output: artifactPath,
    artifacts: [artifactPath],
    report: `already compiled, hash matches (${auto.expectedHash}).` + runWallNote
  };
}

phase("Compile");
// The brief (SKILL.md 168-472) contains the island sentinels used here,
// so its bytes cannot transit the S island (the extractor would terminate
// early on the embedded end-marker). It reaches the compiler by directed
// read instead — same bytes, same position, only the transport changes.
const skillMdPath = `${SKILL_DIR}/SKILL.md`;
const briefBlock = "compiler-agent brief blockquote, SKILL.md lines 168-472";
let compileOut = await agent([
  P.role("compiler agent, passes A-E and G"),
  P.quote(S.compileSpawn, S.briefIntro),
  P.embed(briefBlock, skillMdPath),
  P.input("{{PROMPT_PATH}}", promptPath),
  P.input("{{ARTIFACT_PATH}}", artifactPath),
  P.input("{{VERSION}}", auto.version),
  P.input("emit script", `${SKILL_DIR}/scripts/emit.mjs`),
  P.input("scratch directory for your draft and report", runDir),
  P.ret(),
].join("\n\n"), { schema: COMPILE_SCHEMA, label: "compiler" });
if (!compileOut) {
  return { status: "failed", stage: "compiler", reason: "compiler agent returned null" };
}
log(compileOut.status);

phase("Verify");
let cycles = 0;
let verified = false;
let lastF1 = null;
let lastF2 = null;
while (true) {
  lastF1 = await agent([
    P.role("F1 mechanical gates"),
    P.quote(S.f1),
    P.input("artifact under test", compileOut.artifactNewPath),
    P.input("prompt.md path for --prompt", promptPath),
    P.input("check script", `${SKILL_DIR}/scripts/check.mjs`),
    P.ret(),
  ].join("\n\n"), { schema: F1_SCHEMA, label: "f1-gates" });
  if (!lastF1) {
    return { status: "failed", stage: "f1", reason: "gate agent returned null" };
  }
  log(lastF1.status);
  lastF2 = null;
  if (lastF1.overallPass) {
    lastF2 = await agent([
      P.role("F2 semantic audit, fresh auditor"),
      P.quote(S.f2),
      P.input("prompt.md path", promptPath),
      P.input("artifact under audit", compileOut.artifactNewPath),
      P.ret(),
    ].join("\n\n"), { schema: F2_SCHEMA, effort: "high", label: "f2-audit" });
    if (!lastF2) {
      return { status: "failed", stage: "f2", reason: "audit agent returned null" };
    }
    log(lastF2.status);
    if (lastF2.pass) { verified = true; break; }
  }
  if (cycles >= 2) break;
  cycles++;
  // SKILL.md says continue the SAME compiler agent; the runtime has no
  // continue-an-agent primitive, so each fix cycle re-briefs a fresh agent
  // on the prior draft, report, and failure detail — files carry the context.
  const failDetail = JSON.stringify({
    gates: lastF1.gates,
    findings: lastF2 ? lastF2.findings : []
  });
  const fixed = await agent([
    P.role(`compiler fix cycle ${cycles}`),
    P.quote(S.fixloop, S.briefIntro),
    P.embed(briefBlock, skillMdPath),
    P.input("{{PROMPT_PATH}}", promptPath),
    P.input("{{ARTIFACT_PATH}}", artifactPath),
    P.input("{{VERSION}}", auto.version),
    P.input("emit script", `${SKILL_DIR}/scripts/emit.mjs`),
    P.input("scratch directory for your draft and report", runDir),
    P.input("prior draft to fix", compileOut.draftPath),
    P.input("prior compile report", compileOut.reportPath),
    P.input("failure detail to fix", failDetail),
    P.ret(),
  ].join("\n\n"), { schema: COMPILE_SCHEMA, label: `fix-${cycles}` });
  if (!fixed) {
    return { status: "failed", stage: "fix-loop", reason: "fix agent returned null" };
  }
  log(fixed.status);
  compileOut = fixed;
}
if (!verified) {
  const gateText = JSON.stringify({
    gates: lastF1 ? lastF1.gates : null,
    findings: lastF2 ? lastF2.findings : null
  });
  return {
    status: "failed",
    stage: "verify",
    reason: `gates still failing after ${cycles} fix cycle(s): ` + gateText
  };
}

phase("Finalize");
// Step G prescribes rendering the compile report in chat; a background
// artifact has no chat, so the report lowers to fields on the return object.
const fin = await agent([
  P.role("finalize: atomic move, then report render"),
  P.quote(S.automake, S.render, S.diagTable),
  P.input("verified artifact to move", compileOut.artifactNewPath),
  P.input("final artifact path", artifactPath),
  P.input("compile report path", compileOut.reportPath),
  P.ret(),
].join("\n\n"), { schema: DIAG_SCHEMA, label: "finalize" });
if (!fin) {
  return { status: "failed", stage: "finalize", reason: "finalize agent returned null" };
}
log(fin.status);

return {
  status: "complete",
  output: artifactPath,
  artifacts: [artifactPath, compileOut.reportPath],
  report: `compiled after ${cycles} fix cycle(s) by ${compileOut.compiledBy}.` + runWallNote,
  diagnostics: fin.diagnostics,
  resourcing: fin.resourcing,
  coverage: fin.coverage,
  proposedEdits: fin.proposedEdits
};
