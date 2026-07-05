// my-precious artifact — regenerable; do not hand-edit. Edit the source prompt and re-invoke /my-precious.
// source: staker-poc.md
// my-precious-version: 0.1.1
// compiled-by: claude-sonnet-5
// hash: mp1:60cffccb826bb1b6cc8de1826814a8bb394b95ca422cf1a145fd7347d05c1a5b
export const meta = /*@meta*/{
  "name": "staker-poc",
  "description": "Turn a plain-language question about a public tech or science topic into a short, structured explainer brief.",
  "phases": [{"title": "Survey"}, {"title": "Research"}, {"title": "Outline Check"}, {"title": "Section Drafting"}, {"title": "Tone Check"}, {"title": "Assembly"}]
}/*@end*/
const S = /*@spans*/{
  "zeroInvent": "**Zero-invention rule (HARD).** If a fact cannot be verified from a public source, omit it. No invented facts, no fabricated citations.",
  "handoff": "**Sub-agent handoff rule (HARD).** Sub-agents write their output to files and return one status line. The main context reads structured output from files, never from a sub-agent's return value.",
  "slugRule": "**Slug rule.** `{slug}` is the kebab-case form of the topic, truncated to five words (e.g. \"how vaccines train the immune system\" becomes `how-vaccines-train-immune-system`). Derived once in Step 1.",
  "dateRule": "**Date rule.** `{date}` is the run date in `YYYY-MM-DD`, derived once in Step 1. All files for a run live in `{date}-briefer-{slug}/`. Overwrite if the directory already exists; never import a prior run's files.",
  "step1Task": "Identify the topic from the user's question. Derive `{slug}` and `{date}` per the rules above. Do not access the internet. Pass the topic, and any URL the user supplied, to Step 2.",
  "step2Task": "Gather four to six verifiable facts about the topic from public sources. Write them to the evidence file `{date}-briefer-{slug}/evidence.md` (**scratch**), one bullet per fact, each with a one-line source note. Return one status line.",
  "step2Stop": "If the topic does not resolve to an identifiable public technology or concept — too vague, fictional, or unfindable — report that to the user and stop. State what's unclear about the topic.",
  "styleCard": "<style_card>\nTwo example facts, for register only, never for content:\n- \"A bicycle's front wheel steers itself back under the rider's center of mass; this is why a coasting bike is more stable than a stationary one.\"\n- \"A refrigerator does not create cold — it moves heat from inside the box to the air behind it, using a compressor and a refrigerant that changes state.\"\n</style_card>",
  "step3Task": "Sequential after Step 2. Read the evidence file. Draft a three-section outline that would organize the facts into a short brief. Present the outline to the user through AskQuestion for confirmation, additions, or removals.",
  "step3AskRule": "Ask once. Accept silence as confirmation of the drafted outline. **Append** the finalized outline to the evidence file under an Outline section.",
  "step4Task": "Each sub-agent receives its section title and the evidence bullets relevant to that section, extracted by the main context from the evidence file. Each sub-agent writes 3-5 sentences to its own numbered file `{date}-briefer-{slug}/section-{n}.md` (**scratch**), where the main context assigns `{n}` in outline order. Separate files prevent overlap between parallel sub-agents. Each sub-agent returns one status line.",
  "step5Task": "Waits for all Step 4 sub-agents. Ask the user through AskQuestion: should the final brief read plain (no jargon) or technical (precise terms, defined once on first use)?",
  "step5AskRule": "Ask once. Accept silence — default to plain. Record the answer for Step 6.",
  "step6Task": "Read every `{date}-briefer-{slug}/section-{n}.md` file in outline order. Merge into one brief, applying the Step 5 tone choice throughout. Open with a one-sentence statement of the topic; close with the source notes gathered in Step 2, deduplicated.\n\nWrite the final brief to `{date}-briefer-{slug}/brief-{slug}.md`. Return this path as the run's output."
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

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    question: { type: "string" },
    header: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, description: { type: "string" } },
        required: ["label"],
      },
    },
    multiSelect: { type: "boolean" },
  },
  required: ["id", "question"],
};

const SURVEY_SCHEMA = {
  type: "object",
  properties: { ...STATUS.properties, topic: { type: "string" }, slug: { type: "string" }, url: { type: "string" } },
  required: [...STATUS.required, "topic", "slug", "url"],
};

const RESEARCH_SCHEMA = {
  type: "object",
  properties: { ...STATUS.properties, sufficient: { type: "boolean" }, reason: { type: "string" }, path: { type: "string" } },
  required: [...STATUS.required, "sufficient", "reason", "path"],
};

const DRAFT_OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    sections: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: QUESTION_SCHEMA },
  },
  required: [...STATUS.required, "sections", "questions"],
};

const FINALIZE_OUTLINE_SCHEMA = {
  type: "object",
  properties: { ...STATUS.properties, sections: { type: "array", items: { type: "string" } } },
  required: [...STATUS.required, "sections"],
};

const SECTION_SCHEMA = {
  type: "object",
  properties: { ...STATUS.properties, n: { type: "number" } },
  required: [...STATUS.required, "n"],
};

const TONE_DRAFT_SCHEMA = {
  type: "object",
  properties: { ...STATUS.properties, questions: { type: "array", items: QUESTION_SCHEMA } },
  required: [...STATUS.required, "questions"],
};

phase("Survey");
const _args = typeof args === "string" ? JSON.parse(args) : (args ?? {});
const { context, invokedAt, runStamp, cwd, answers = {} } = _args;
if (!context) return { status: "failed", stage: "envelope", reason: "missing args.context" };

const surveyResult = await agent(
  [
    P.role("survey"),
    P.quote(S.slugRule, S.step1Task),
    P.input("Question", context),
    P.ret(),
  ].join("\n\n"),
  { schema: SURVEY_SCHEMA, phase: "Survey" }
);
if (!surveyResult) return { status: "failed", stage: "survey", reason: "agent unavailable" };
log(surveyResult.status);
const { topic, slug, url } = surveyResult;

// date is derived from invokedAt only, never from an agent guess or a
// runtime clock call (both are off limits here) — deterministic plumbing
// for the YYYY-MM-DD the Date rule requires.
const date = invokedAt.slice(0, 10);
const runDir = `${cwd}/${date}-briefer-${slug}`;
const evidencePath = `${runDir}/evidence.md`;

phase("Research");
const researchResult = await agent(
  [
    P.role("research"),
    P.quote(S.zeroInvent, S.handoff, S.dateRule, S.step2Task, S.step2Stop),
    P.input("Style card", S.styleCard),
    P.input("Topic", topic),
    P.input("URL", url),
    P.out(evidencePath),
    P.ret(),
  ].join("\n\n"),
  { schema: RESEARCH_SCHEMA, phase: "Research" }
);
if (!researchResult) return { status: "failed", stage: "research", reason: "agent unavailable" };
log(researchResult.status);
if (!researchResult.sufficient) {
  return { status: "stopped", stage: "research", reason: researchResult.reason };
}

phase("Outline Check");
const draftOutline = await agent(
  [
    P.role("outline drafter"),
    P.quote(S.step3Task, S.step3AskRule),
    P.read([evidencePath]),
    P.ret(),
  ].join("\n\n"),
  { schema: DRAFT_OUTLINE_SCHEMA, phase: "Outline Check" }
);
if (!draftOutline) return { status: "failed", stage: "outline-draft", reason: "agent unavailable" };
log(draftOutline.status);

const outlineAnswer = answers["outline"];
if (!outlineAnswer) {
  return {
    status: "needs_user",
    boundary: "outline",
    questions: draftOutline.questions,
    partial: `Draft outline ready: ${draftOutline.sections.join(", ")}`,
  };
}

const finalizeOutline = await agent(
  [
    P.role("outline finalizer"),
    P.quote(S.dateRule, S.step3AskRule),
    P.input("Drafted sections", draftOutline.sections.join(" | ")),
    P.input("User answer", JSON.stringify(outlineAnswer)),
    P.read([evidencePath]),
    P.out(evidencePath),
    P.ret(),
  ].join("\n\n"),
  { schema: FINALIZE_OUTLINE_SCHEMA, phase: "Outline Check" }
);
if (!finalizeOutline) return { status: "failed", stage: "outline-finalize", reason: "agent unavailable" };
log(finalizeOutline.status);

const sectionTitles = finalizeOutline.sections;
if (!Array.isArray(sectionTitles) || sectionTitles.length === 0) {
  return { status: "failed", stage: "outline-finalize", reason: "no sections finalized" };
}
if (sectionTitles.length > 4096) {
  return { status: "failed", stage: "outline-finalize", reason: "section count exceeds run cap" };
}

phase("Section Drafting");
const sectionFiles = sectionTitles.map((title, i) => ({
  n: i + 1,
  title,
  evidencePath: `${runDir}/section-${i + 1}-evidence.md`,
  path: `${runDir}/section-${i + 1}.md`,
}));

const extractResult = await agent(
  [
    P.role("extract section evidence"),
    P.quote(S.dateRule, S.step4Task),
    P.input("Sections", sectionFiles.map((s) => `${s.title} -> ${s.evidencePath}`).join(" | ")),
    P.read([evidencePath]),
    P.out(sectionFiles.map((s) => s.evidencePath).join(", ")),
    P.ret(),
  ].join("\n\n"),
  { schema: STATUS, effort: "low", phase: "Section Drafting" }
);
if (!extractResult) return { status: "failed", stage: "extract-evidence", reason: "agent unavailable" };
log(extractResult.status);

const sectionThunks = sectionFiles.map((s) => async () => {
  return await agent(
    [
      P.role("section drafter"),
      P.quote(S.zeroInvent, S.handoff, S.dateRule, S.step4Task),
      P.input("Section title", s.title),
      P.input("Section number", String(s.n)),
      P.embed("evidence bullets", s.evidencePath),
      P.out(s.path),
      P.ret(),
    ].join("\n\n"),
    { schema: SECTION_SCHEMA, model: "haiku", phase: "Section Drafting" }
  );
});
const sectionResultsRaw = await parallel(sectionThunks);
const sectionResults = sectionResultsRaw.filter(Boolean);
const droppedSections = sectionResultsRaw.length - sectionResults.length;
if (droppedSections > 0) {
  log(`section-drafting: dropped ${droppedSections} null result(s)`);
}
if (sectionResults.length === 0) {
  return { status: "failed", stage: "section-drafting", reason: "all section writers failed" };
}
// sectionFiles is already in outline order; filter preserves that order, so
// surviving entries line up with the read order Assembly needs.
const okNs = new Set(sectionResults.map((r) => r.n));
const orderedSections = sectionFiles.filter((s) => okNs.has(s.n));

phase("Tone Check");
const toneQuestion = await agent(
  [
    P.role("tone check"),
    P.quote(S.step5Task, S.step5AskRule),
    P.ret(),
  ].join("\n\n"),
  { schema: TONE_DRAFT_SCHEMA, effort: "low", phase: "Tone Check" }
);
if (!toneQuestion) return { status: "failed", stage: "tone-check", reason: "agent unavailable" };
log(toneQuestion.status);

const toneAnswer = answers["tone"];
if (!toneAnswer) {
  return {
    status: "needs_user",
    boundary: "tone",
    questions: toneQuestion.questions,
    partial: "Awaiting tone choice for the final brief.",
  };
}
const tone = (!toneAnswer.skipped && toneAnswer.tone === "technical") ? "technical" : "plain";

phase("Assembly");
const briefPath = `${runDir}/brief-${slug}.md`;
const orderedPaths = orderedSections.map((s) => s.path);
const assemblyResult = await agent(
  [
    P.role("assembly"),
    P.quote(S.zeroInvent, S.dateRule, S.step6Task),
    P.input("Tone", tone),
    P.input("Topic", topic),
    P.read([evidencePath, ...orderedPaths]),
    P.out(briefPath),
    P.ret(),
  ].join("\n\n"),
  { schema: STATUS, phase: "Assembly" }
);
if (!assemblyResult) return { status: "failed", stage: "assembly", reason: "agent unavailable" };
log(assemblyResult.status);

return {
  status: "complete",
  output: briefPath,
  artifacts: [evidencePath, ...orderedPaths, briefPath],
  report: `Brief on ${slug} written to ${briefPath}.`,
};
