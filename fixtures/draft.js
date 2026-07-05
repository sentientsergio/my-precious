export const meta = /*@meta*/{
  "name": "prompt",
  "description": "Summarize the fixture notes into one paragraph.",
  "phases": [{"title": "Summarize"}]
}/*@end*/
const S = /*@spans*/{
  "goal": "$SPAN(4,4)",
  "rules": "$SPAN(7,8)"
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

phase("Summarize");
const { context, invokedAt, runStamp, cwd, answers = {} } = args ?? {};
if (!context) return { status: "failed", stage: "envelope", reason: "missing args.context" };

const runDir = `./runs/prompt-${runStamp}`;
const s1 = await agent([
  P.role("Summarize"),
  P.quote(S["goal"], S["rules"]),
  P.input("Notes", context),
  P.out(`${runDir}/summary.md`),
  P.ret(),
].join("\n\n"), { schema: STATUS, label: "summarize", phase: "Summarize" });
if (!s1) return { status: "failed", stage: "summarize", reason: "agent unavailable" };
log(s1.status);

return { status: "complete", output: `${runDir}/summary.md`, artifacts: [`${runDir}/summary.md`], report: "Summarized the notes into a paragraph." };
