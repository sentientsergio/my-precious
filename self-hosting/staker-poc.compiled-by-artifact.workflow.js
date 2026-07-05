// my-precious artifact — regenerable; do not hand-edit. Edit the source prompt and re-invoke /my-precious.
// source: staker-poc.md
// my-precious-version: 0.1.1
// compiled-by: claude-fable-5
// hash: mp1:60cffccb826bb1b6cc8de1826814a8bb394b95ca422cf1a145fd7347d05c1a5b
export const meta = /*@meta*/{
  "name": "staker-poc",
  "description": "Turn a plain-language question about a public technology or science topic into a short, structured explainer brief.",
  "phases": [
    {"title": "Survey"},
    {"title": "Research"},
    {"title": "Outline Check"},
    {"title": "Section Drafting"},
    {"title": "Tone Check"},
    {"title": "Assembly"}
  ]
}/*@end*/
const S = /*@spans*/{
  "goal": "The Briefer turns a plain-language question about a public technology or science topic into a short, structured explainer brief. Point it at any topic — how a bicycle stays upright, how a refrigerator moves heat, how a search index works — and it surveys the question, gathers a handful of verifiable facts, drafts an outline, splits the outline into sections, drafts each section, and assembles a final brief. This is a proof-of-concept pipeline: six steps, not eighteen, but every step is fully prescribed the same way.",
  "rule.zero": "**Zero-invention rule (HARD).** If a fact cannot be verified from a public source, omit it. No invented facts, no fabricated citations.",
  "rule.handoff": "**Sub-agent handoff rule (HARD).** Sub-agents write their output to files and return one status line. The main context reads structured output from files, never from a sub-agent's return value.",
  "rule.slug": "**Slug rule.** `{slug}` is the kebab-case form of the topic, truncated to five words (e.g. \"how vaccines train the immune system\" becomes `how-vaccines-train-immune-system`). Derived once in Step 1.",
  "rule.date": "**Date rule.** `{date}` is the run date in `YYYY-MM-DD`, derived once in Step 1. All files for a run live in `{date}-briefer-{slug}/`. Overwrite if the directory already exists; never import a prior run's files.",
  "step1": "### Step 1. Survey (main context, parent)\n\nIdentify the topic from the user's question. Derive `{slug}` and `{date}` per the rules above. Do not access the internet. Pass the topic, and any URL the user supplied, to Step 2.",
  "step2.setup": "### Step 2. Research (sub-agent, parent)\n\nSequential after Step 1. Sub-agent receives the topic and any user-supplied URL.\n\nInject the block below verbatim into the sub-agent's prompt, after the topic and before the task instructions — it is the fixed style guide for how a research fact should read.",
  "style_card": "<style_card>\nTwo example facts, for register only, never for content:\n- \"A bicycle's front wheel steers itself back under the rider's center of mass; this is why a coasting bike is more stable than a stationary one.\"\n- \"A refrigerator does not create cold — it moves heat from inside the box to the air behind it, using a compressor and a refrigerant that changes state.\"\n</style_card>",
  "step2.task": "Gather four to six verifiable facts about the topic from public sources. Write them to the evidence file `{date}-briefer-{slug}/evidence.md` (**scratch**), one bullet per fact, each with a one-line source note. Return one status line.\n\nIf the topic does not resolve to an identifiable public technology or concept — too vague, fictional, or unfindable — report that to the user and stop. State what's unclear about the topic.",
  "step3": "### Step 3. Outline Check (main context)\n\nSequential after Step 2. Read the evidence file. Draft a three-section outline that would organize the facts into a short brief. Present the outline to the user through AskQuestion for confirmation, additions, or removals.\n\nAsk once. Accept silence as confirmation of the drafted outline. **Append** the finalized outline to the evidence file under an Outline section.",
  "step4": "### Step 4. Section Drafting (sub-agents, parallel, fast)\n\nWaits for Step 3. Launch one sub-agent per outline section, in parallel — three sections, three sub-agents.\n\nEach sub-agent receives its section title and the evidence bullets relevant to that section, extracted by the main context from the evidence file. Each sub-agent writes 3-5 sentences to its own numbered file `{date}-briefer-{slug}/section-{n}.md` (**scratch**), where the main context assigns `{n}` in outline order. Separate files prevent overlap between parallel sub-agents. Each sub-agent returns one status line.",
  "step5": "### Step 5. Tone Check (main context)\n\nWaits for all Step 4 sub-agents. Ask the user through AskQuestion: should the final brief read plain (no jargon) or technical (precise terms, defined once on first use)?\n\nAsk once. Accept silence — default to plain. Record the answer for Step 6.",
  "step6": "### Step 6. Assembly (main context, parent)\n\nRead every `{date}-briefer-{slug}/section-{n}.md` file in outline order. Merge into one brief, applying the Step 5 tone choice throughout. Open with a one-sentence statement of the topic; close with the source notes gathered in Step 2, deduplicated.\n\nWrite the final brief to `{date}-briefer-{slug}/brief-{slug}.md`. Return this path as the run's output."
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
const SURVEY = {
  type: "object",
  properties: {
    topic: { type: "string" },
    slug: { type: "string" },
    date: { type: "string" },
    url: { type: "string" },
  },
  required: ["topic", "slug", "date"],
};
const RESEARCH = {
  type: "object",
  properties: {
    status: { type: "string" },
    resolved: { type: "boolean" },
    unclear: { type: "string" },
  },
  required: ["status", "resolved"],
};
const QUESTIONS = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          header: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                description: { type: "string" },
              },
              required: ["label"],
            },
          },
          multiSelect: { type: "boolean" },
        },
        required: ["id", "question"],
      },
    },
  },
  required: ["questions"],
};
const FINALIZE = {
  type: "object",
  properties: {
    status: { type: "string" },
    sections: { type: "array", items: { type: "string" } },
  },
  required: ["status", "sections"],
};

phase("Survey");
// Runtime delivers args as a JSON string (probe P6); parse before any read.
const _args = typeof args === "string" ? JSON.parse(args) : (args ?? {});
const { context, invokedAt, runStamp, cwd, answers = {} } = _args;
if (!context) return { status: "failed", stage: "envelope", reason: "missing args.context" };

const survey = await agent([
  P.role("survey"),
  P.quote(S["goal"], S["rule.slug"], S["rule.date"], S["step1"]),
  P.input("User question (run context, verbatim)", context),
  P.input("Run date source: invokedAt (ISO-8601)", invokedAt),
  P.ret(),
].join("\n\n"), { label: "survey", schema: SURVEY });
if (!survey) return { status: "failed", stage: "survey", reason: "survey agent returned null" };

// Prompt names the run dir but not its base; anchored at the invocation cwd.
const runDir = `${cwd}/${survey.date}-briefer-${survey.slug}`;
const evidencePath = `${runDir}/evidence.md`;

phase("Research");
const research = await agent([
  P.role("research"),
  P.quote(S["rule.zero"], S["rule.handoff"], S["rule.date"], S["step2.setup"]),
  P.input("Topic", survey.topic),
  P.input("User-supplied URL (empty if none)", survey.url ?? ""),
  S["style_card"],
  P.quote(S["step2.task"]),
  P.out(evidencePath),
  P.ret(),
].join("\n\n"), { label: "research", schema: RESEARCH });
if (!research) return { status: "failed", stage: "research", reason: "research agent returned null" };
log(research.status);
if (!research.resolved) {
  const why = research.unclear ?? "the stage stated no detail";
  return { status: "stopped", stage: "research", reason: `per the quoted step 2 stop rule: ${why}` };
}

phase("Outline Check");
const outlineDraftPath = `${runDir}/outline-draft.md`;
const outlineDraft = await agent([
  P.role("outline draft"),
  P.quote(S["rule.zero"], S["rule.handoff"], S["step3"]),
  P.read([evidencePath]),
  P.out(outlineDraftPath),
  P.ret(),
].join("\n\n"), { label: "outline-draft", schema: QUESTIONS });
if (!outlineDraft) {
  return { status: "failed", stage: "outline-draft", reason: "outline-draft agent returned null" };
}
if (!("outline" in answers)) {
  return {
    status: "needs_user",
    boundary: "outline",
    questions: outlineDraft.questions,
    partial: "outline drafted from evidence; awaiting confirmation",
  };
}

const outline = await agent([
  P.role("outline finalize"),
  P.quote(S["rule.handoff"], S["step3"]),
  P.read([evidencePath, outlineDraftPath]),
  P.input("User answer to the outline check (JSON)", JSON.stringify(answers.outline)),
  P.ret(),
].join("\n\n"), { label: "outline-finalize", schema: FINALIZE });
if (!outline) {
  return { status: "failed", stage: "outline-finalize", reason: "finalize agent returned null" };
}
if (outline.sections.length === 0) {
  return { status: "failed", stage: "outline-finalize", reason: "finalized outline has no sections" };
}
// Prompt prescribes a three-section outline; cap guards a runaway user edit.
if (outline.sections.length > 16) log("outline capped at 16 sections (fan-out guard)");
const sections = outline.sections.slice(0, 16);

phase("Section Drafting");
const extractPaths = sections.map((_, i) => `${runDir}/section-evidence-${i + 1}.md`);
const extract = await agent([
  P.role("evidence extraction"),
  P.quote(S["rule.handoff"], S["step4"]),
  P.read([evidencePath]),
  P.input("Section titles in outline order (JSON)", JSON.stringify(sections)),
  P.input("Per-section output files, in order (JSON)", JSON.stringify(extractPaths)),
  P.ret(),
].join("\n\n"), { label: "extract-evidence", schema: STATUS });
if (!extract) {
  return { status: "failed", stage: "extract-evidence", reason: "extraction agent returned null" };
}
log(extract.status);

const drafts = await parallel(sections.map((title, i) => async () => agent([
  P.role("section drafting"),
  P.quote(S["rule.zero"], S["rule.handoff"], S["step4"]),
  P.input("Section title", title),
  P.input("Assigned section number {n}", String(i + 1)),
  P.embed("evidence bullets relevant to that section", extractPaths[i]),
  P.out(`${runDir}/section-${i + 1}.md`),
  P.ret(),
].join("\n\n"), {
  label: `draft-section-${i + 1}`,
  phase: "Section Drafting",
  model: "haiku",
  schema: STATUS,
})));
const okDrafts = drafts.filter(Boolean);
okDrafts.forEach((d) => log(d.status));
const dropped = sections.length - okDrafts.length;
if (dropped > 0) {
  log(`${dropped} section draft(s) returned null`);
  return {
    status: "failed",
    stage: "section-drafting",
    reason: `${dropped} of ${sections.length} section drafts failed`,
  };
}

phase("Tone Check");
// Step 5's question is fully prescribed; lowered statically so every
// boundary round presents identical options (no re-drafting drift).
if (!("tone" in answers)) {
  return {
    status: "needs_user",
    boundary: "tone",
    questions: [{
      id: "tone",
      question: "Should the final brief read plain or technical?",
      header: "Tone",
      options: [
        { label: "plain", description: "no jargon" },
        { label: "technical", description: "precise terms, defined once on first use" },
      ],
    }],
    partial: "sections drafted; awaiting tone choice",
  };
}

phase("Assembly");
const sectionPaths = sections.map((_, i) => `${runDir}/section-${i + 1}.md`);
const briefPath = `${runDir}/brief-${survey.slug}.md`;
const assembly = await agent([
  P.role("assembly"),
  P.quote(S["rule.zero"], S["step5"], S["step6"]),
  P.read([...sectionPaths, evidencePath]),
  P.input("User answer to the tone check (JSON)", JSON.stringify(answers.tone)),
  P.out(briefPath),
  P.ret(),
].join("\n\n"), { label: "assembly", schema: STATUS });
if (!assembly) return { status: "failed", stage: "assembly", reason: "assembly agent returned null" };
log(assembly.status);

return {
  status: "complete",
  output: briefPath,
  artifacts: [briefPath, evidencePath, ...sectionPaths],
  report: `Briefer run complete: brief at ${briefPath}; run files in ${runDir}.`,
};
