// my-precious artifact — regenerable; do not hand-edit. Edit the source prompt and re-invoke /my-precious.
// source: smoke.md
// my-precious-version: 0.1.0
// compiled-by: claude-sonnet-5
// hash: mp1:e560c17bf1c706a7be1940bf635ad9a9b1123b3a64b281636bf625b592b52585
export const meta = /*@meta*/{
  "name": "smoke",
  "description": "Write short, fact-checked \"did you know\" briefs for a handful of topics, plus a summary index.",
  "phases": [{"title": "Frame"}, {"title": "Write Briefs"}, {"title": "Verify Facts"}, {"title": "Synthesize Index"}]
}/*@end*/
const S = /*@spans*/{
  "goal": "Given a short list of topic names (in the run context), write a one-paragraph\n\"did you know\" brief for each: one specific, checkable fact plus why it's\ninteresting. Keep each brief under 100 words.",
  "dontInvent": "- Don't invent facts. If you're not confident in one, say so instead of\n  guessing.",
  "outputSpec": "- One file per topic, named after the topic, plus a single index file\n  listing all of them with a one-line summary each.",
  "scopeSmall": "- Keep the whole run small — a handful of topics, not a research project."
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
// ...plus any per-stage schema extension you need, control-plane fields only.

const FRAME_SCHEMA = {
  type: "object",
  properties: {
    topics: { type: "array", items: { type: "string" } },
    sufficient: { type: "boolean" },
    reason: { type: "string" }
  },
  required: ["topics", "sufficient", "reason"]
};

const WORK_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    topic: { type: "string" },
    path: { type: "string" }
  },
  required: [...STATUS.required, "topic", "path"]
};

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    topic: { type: "string" },
    path: { type: "string" },
    ok: { type: "boolean" },
    reason: { type: "string" }
  },
  required: [...STATUS.required, "topic", "path", "ok", "reason"]
};

const SYNTH_SCHEMA = {
  type: "object",
  properties: {
    ...STATUS.properties,
    path: { type: "string" }
  },
  required: [...STATUS.required, "path"]
};

phase("Frame");
const { context, invokedAt, runStamp, cwd, answers = {} } = args ?? {};
if (!context) return { status: "failed", stage: "envelope", reason: "missing args.context" };

const frameResult = await agent(
  [
    P.role("frame"),
    P.quote(S.goal, S.scopeSmall),
    P.input("context", context),
    P.ret()
  ].join("\n\n"),
  { schema: FRAME_SCHEMA, model: "haiku", effort: "low", phase: "Frame" }
);
if (!frameResult) {
  return { status: "failed", stage: "frame", reason: "frame agent returned null" };
}
if (!frameResult.sufficient) {
  return { status: "stopped", stage: "frame", reason: frameResult.reason };
}
const topics = frameResult.topics;
if (!Array.isArray(topics) || topics.length === 0) {
  return { status: "failed", stage: "frame", reason: "no topics extracted from context" };
}
if (topics.length > 4096) {
  return { status: "failed", stage: "frame", reason: "topic count exceeds run cap" };
}

phase("Write Briefs");
const outDir = `${cwd}/my-precious-runs/${runStamp}`;

const workThunks = topics.map((topic) => async () => {
  const outPath = `${outDir}/${topic}.md`;
  return await agent(
    [
      P.role("brief writer"),
      P.quote(S.goal, S.dontInvent, S.outputSpec),
      P.input("topic", topic),
      P.out(outPath),
      P.ret()
    ].join("\n\n"),
    { schema: WORK_SCHEMA, phase: "Write Briefs" }
  );
});

const workResultsRaw = await parallel(workThunks);
const workResults = workResultsRaw.filter(Boolean);
const droppedWork = workResultsRaw.length - workResults.length;
if (droppedWork > 0) {
  log(`write-briefs: dropped ${droppedWork} null result(s)`);
}
if (workResults.length === 0) {
  return { status: "failed", stage: "work", reason: "all brief writers failed" };
}

phase("Verify Facts");

const verifyThunks = workResults.map((item) => async () => {
  return await agent(
    [
      P.role("fact verifier"),
      P.quote(S.goal, S.dontInvent),
      P.input("topic", item.topic),
      P.read([item.path]),
      P.ret()
    ].join("\n\n"),
    { schema: VERIFY_SCHEMA, effort: "high", phase: "Verify Facts" }
  );
});

const verifyResultsRaw = await parallel(verifyThunks);
const verifyResults = verifyResultsRaw.filter(Boolean);
const droppedVerify = verifyResultsRaw.length - verifyResults.length;
if (droppedVerify > 0) {
  log(`verify-facts: dropped ${droppedVerify} null result(s)`);
}

const passed = verifyResults.filter((v) => v.ok);
const failedCount = verifyResults.length - passed.length;
if (failedCount > 0) {
  log(`verify-facts: ${failedCount} brief(s) failed verification`);
}
if (passed.length === 0) {
  return { status: "failed", stage: "verify", reason: "no briefs passed verification" };
}

phase("Synthesize Index");
const indexPath = `${outDir}/index.md`;

const synthResult = await agent(
  [
    P.role("index synthesizer"),
    P.quote(S.outputSpec),
    P.read(passed.map((p) => p.path)),
    P.out(indexPath),
    P.ret()
  ].join("\n\n"),
  { schema: SYNTH_SCHEMA, phase: "Synthesize Index" }
);
if (!synthResult) {
  return { status: "failed", stage: "synthesize", reason: "index agent returned null" };
}

return {
  status: "complete",
  output: synthResult.path,
  artifacts: passed.map((p) => p.path),
  report: `Wrote ${passed.length} brief(s); index at ${synthResult.path}.`
};
