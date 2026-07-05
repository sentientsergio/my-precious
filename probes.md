# my-precious — probes.md

Runtime probes P1-P5 (design.md §2), run against the live `Workflow` tool via throwaway workflows. Scripts themselves are not committed — they live under the session's own workflow-script directory, not this repo (build.md ground rule 5). Verdicts below drove the design-errata commit that follows this one.

## P1 — default agent toolset

**Question:** does the default workflow subagent's toolset include Read/Write/Bash and web access (WebSearch/WebFetch)?

**Verdict:** confirmed.

**Evidence:** run `wf_2a97da50-840`, agent `p1-toolcheck` (model `claude-sonnet-5`, inherited). Instructed to attempt a scratchpad file write+read, a bash echo, a live web search, and a live web fetch, and to report `false` rather than guess for anything unavailable. Result: `{"canWriteRead":true,"canBash":true,"canWebSearch":true,"canWebFetch":true,"detail":"1. Write/Read: TRUE. Wrote \"probe-p1-ok\"... 2. Bash: TRUE (echo bash-ok-12345)... 3. WebSearch: TRUE... 4. WebFetch: TRUE..."}`. Independently corroborated, not just self-reported: the task record shows `toolCalls:7` for this agent (consistent with genuine multi-tool execution, not a fabricated report), and a direct read of the target scratchpad file during the WP0 red-team pass confirmed its content is exactly `probe-p1-ok`, matching the claim byte for byte. No fallback needed.

## P2 — resume caching across a boundary round

**Question:** does resume caching hold when a re-invocation adds envelope fields that only post-boundary prompts interpolate — i.e. does `Workflow({scriptPath, resumeFromRunId, args})` replay unchanged pre-boundary `agent()` calls from cache while re-evaluating the boundary branch and running post-boundary stages live against the new `args`?

**Verdict:** fallback-triggered.

**Evidence:** three independent runs, identical signature each time.

- Combined P1-P4 probe (run `wf_2a97da50-840`): first call (`args:{}`) returned `needs_user`, `partial:"marker was q7Xk2mZp9R"`. Resumed with `args:{answers:{"probe-boundary":{"ping":"pong"}}}` (task `w3o9v27f4`) — returned the byte-identical `needs_user` object. `agent_count:2` unchanged, `subagent_tokens:0`, `tool_uses:0`, `duration_ms:5`. The boundary branch did not re-evaluate; the third agent call (`p3-check`) was never attempted.
- Isolated minimal probe (run `wf_b8b2adaa-586`, task `we6phd5r3`): first call (`args:{}`) returned `needs_user`, `partial:"a=ONE"`. Resumed with `args:{proceed:true, tag:"RESUMED"}` (task `wpflrmbgl`) — identical `needs_user`/`a=ONE`, 0 tokens, 2ms. `proceed:true` should have skipped the early return; it did not.
- Same run, resumed again after a trivial non-agent-call script edit (an inserted comment) plus `args:{proceed:true, tag:"RESUMED2"}` (task `wolcfff8n`) — still the byte-identical cached `needs_user`/`a=ONE`, 0 tokens, 4ms.

Once a script reaches any top-level `return` (a completed run, `needs_user` included — ABI row 14), `resumeFromRunId` replays that cached terminal result unconditionally. It does not re-execute the script's control flow against new `args`, with or without an incidental script edit. The tool's resume mechanism serves interrupted or incomplete runs (kill, crash, mid-flight script edit); it does not serve "return `needs_user`, then progress past it with new input" — a distinct use design.md's D6 had assumed it could reuse.

**Fallback adopted** (the §2 row's own stated fallback): each boundary round is a fresh `Workflow({scriptPath, args})` invocation from scratch, no `resumeFromRunId` — carrying the accumulated `answers` in `args`. Pre-boundary stages redo their real work every round. Correct, costlier. See the design-errata commit for the propagated edits to §6 (D6) and §9.2.

## P3 — workflow agents cannot ask the user questions

**Question:** do workflow agents (headless, background) lack any tool to interactively ask the end user a question and block on their reply?

**Verdict:** confirmed.

**Evidence:** run `wf_89c2b6f9-763`, agent `p3-check`. Instructed to self-report its actual current tool inventory (not guess) and state whether any tool opens a synchronous ask-and-wait channel to the end user. Result: `hasInteractiveUserTool:false`, with a full enumerated tool list and an explicit note that even asynchronous mechanisms it could see named (e.g. a widget's `sendPrompt`) surface as a new future turn, not a pause-and-wait within the current call. Corroborated by an independent, non-self-report source: design.md's own ABI row 9 already documents "Subagents are told their final text is a return value, not a user-facing message... they run headless" — the empirical self-report and the tool's documented behavior agree. No fallback needed — confirms §6's premise that boundaries are architecturally necessary, not merely convenient.

## P4 — completion notification exposes the return object

**Question:** does the workflow completion notification expose the script's returned object directly (or only via `TaskOutput`)?

**Verdict:** confirmed.

**Evidence:** every task notification observed across all probe runs carried a `result` field equal to exactly the object the script returned — both the `needs_user` shape (`{status, boundary, questions, partial}`, run `wf_2a97da50-840`) and the `complete` shape (`{status, output, artifacts, report}`, e.g. run `wf_89c2b6f9-763`). No fallback needed — `SKILL.md`'s run loop can read `result` straight from the notification; the `result.json`-in-scratch fallback is unnecessary.

## P5 — meta parser tolerates quoted keys and sentinel comments

**Question:** does the runtime's meta parser tolerate quoted keys and the `/*@meta*/…/*@end*/` sentinel comments immediately adjacent to the `meta` literal, per design §3.1's artifact header shape?

**Verdict:** confirmed.

**Evidence:** run `wf_06f40be6-a02` (task `wb85vaagh`), script's `meta` written exactly as `export const meta = /*@meta*/{"name": "probe-p5", ...}/*@end*/` with quoted keys throughout. Ran to completion in 3ms with the expected report string (`"p5 meta shape accepted: quoted keys + adjacent sentinels parsed fine"`). No fallback needed.

## P6 — args delivery shape

**Question:** in what shape does the runtime deliver the `args` global to a script — the object passed to `Workflow({scriptPath, args})`, or something else?

**Verdict:** the runtime delivers `args` as a JSON **string**, not a parsed object.

**Evidence:** an inline probe workflow invoked with `Workflow({scriptPath, args: {"context":"probe-hello", ...}})` read back `typeof args === "string"`, with the value equal to the raw JSON text of the object passed in — not a live object. Consequently the compiled smoke artifact's envelope line (`const { context } = args ?? {}`) destructured a string, `context` came back `undefined`, and the artifact returned `{"status":"failed","stage":"envelope","reason":"missing args.context"}` on every run — reproduced on two independent smoke runs, `wf_2887c79c-e28` and `wf_e9ccad26-154`, both failing identically at the envelope guard. This is a real gap: none of P1-P5 checked the shape `args` actually arrives in, only that it "arrives verbatim" (design §2 row 6) — true of its *content*, silent on its *type*.

**Fallback adopted:** every artifact parses the envelope defensively before destructuring — `const _args = typeof args === "string" ? JSON.parse(args) : (args ?? {});` — and reads all envelope fields from `_args`, never `args` directly. See `SKILL.md`'s compiler-agent brief (Envelope section) for the emission rule, and design.md §3.4 / §13 for the corresponding notes.

## Summary

| Probe | Verdict | §2 edited? |
|---|---|---|
| P1 | confirmed | untouched |
| P2 | fallback-triggered | edited (design-errata commit) |
| P3 | confirmed | untouched |
| P4 | confirmed | untouched |
| P5 | confirmed | untouched |
| P6 | fallback-triggered | not edited (this errata is scoped to SKILL.md/probes.md/design §3.4+§13 — see build brief) |

**Downstream note (not part of this errata):** build.md's WP4 done-when criterion names `resumeFromRunId` explicitly as the mechanism to exercise for the boundary round-trip. That wording is now stale against the corrected §6/§9.2 and should be read as "the boundary protocol" (fresh relaunch carrying accumulated answers, not a literal `resumeFromRunId` call) when WP4 is reached. Flagged for the principal rather than silently edited — build.md is outside this errata's scope (ground rule 2 covers design.md's §2 rows, nothing more). Also worth the principal's attention: the adopted fallback makes every multi-round interaction loop (e.g. the specimen's Step 8, up to 8 rounds) re-run all its pre-boundary stages from scratch on each round — for the staker this means re-running Steps 1-7 up to 8 times over, a real cost the original design did not price in.
