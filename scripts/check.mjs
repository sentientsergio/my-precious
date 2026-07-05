#!/usr/bin/env node
// my-precious — scripts/check.mjs
//
// F1 mechanical gates (design.md §7) against an emitted artifact. Every gate
// is evaluated independently and always runs — even after an earlier gate
// fails — so a caller (the compiler's fix loop, or a fixture test asserting
// "exactly this gate trips") gets the full per-gate picture, not just the
// first failure.
//
// CLI:
//   node scripts/check.mjs <artifact.js> [--prompt <prompt.md>] [--json]
// Exit code 0 iff every gate passes.
//
// Programmatic:
//   import { runChecks } from "./check.mjs";

import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { computeHash } from "./emit.mjs";

const RESULT_STATUSES = ["complete", "needs_user", "stopped", "failed"];
const ALLOWED_ENVELOPE_FIELDS = ["context", "invokedAt", "runStamp", "cwd", "answers"];
const FORBIDDEN_API_PATTERNS = [
  { name: "Date.now(", re: /Date\.now\(/ },
  { name: "new Date(", re: /new Date\(/ },
  { name: "Math.random(", re: /Math\.random\(/ },
  { name: "require(", re: /require\(/ },
  { name: "import", re: /\bimport\b/ },
  { name: "process.", re: /process\./ },
  { name: "fs.", re: /\bfs\./ },
];
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_LITERAL_LEN = 80;

// ---------- generic text-surgery helpers ----------

/** Find the next `openTag ... /*@end*\/` island starting at or after `from`. */
function extractIsland(text, openTag, from = 0) {
  const openIdx = text.indexOf(openTag, from);
  if (openIdx === -1) return null;
  const jsonStart = openIdx + openTag.length;
  const endIdx = text.indexOf("/*@end*/", jsonStart);
  if (endIdx === -1) return null;
  const jsonText = text.slice(jsonStart, endIdx).trim();
  const closeIdx = endIdx + "/*@end*/".length;
  return { jsonText, openIdx, jsonStart, endIdx, closeIdx };
}

/** Replace text[start,end) with same-length filler, preserving newlines (so line numbers survive). */
function mask(text, start, end) {
  let filler = "";
  for (let i = start; i < end; i++) {
    filler += text[i] === "\n" ? "\n" : " ";
  }
  return text.slice(0, start) + filler + text.slice(end);
}

/**
 * Starting at the first `{` at/after fromIdx, find the index of its matching
 * `}`, treating '...'/"..."/`...` as opaque (escape-aware) tokens so braces
 * inside strings/template interpolations never affect depth.
 */
function findMatchingBrace(text, openBraceIdx) {
  let depth = 0;
  let inString = null;
  for (let i = openBraceIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Mask a `const <name> = { ... };` block (object-literal RHS), e.g. the P table. */
function maskConstObjectBlock(text, constName) {
  const marker = `const ${constName} = {`;
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  const openBrace = idx + marker.length - 1; // index of the '{'
  const closeBrace = findMatchingBrace(text, openBrace);
  if (closeBrace === -1) return text;
  return mask(text, openBrace, closeBrace + 1);
}

// ---------- load + derive views ----------

function loadArtifact(artifactPath, explicitPromptPath) {
  const raw = readFileSync(artifactPath, "utf8");
  const dir = dirname(resolve(artifactPath));

  const sourceMatch = raw.match(/^\/\/ source: (.+)$/m);
  const versionMatch = raw.match(/^\/\/ my-precious-version: (.+)$/m);
  const compiledByMatch = raw.match(/^\/\/ compiled-by: (.+)$/m);
  const hashMatch = raw.match(/^\/\/ hash: (.+)$/m);

  const header = {
    source: sourceMatch && sourceMatch[1].trim(),
    version: versionMatch && versionMatch[1].trim(),
    compiledBy: compiledByMatch && compiledByMatch[1].trim(),
    hash: hashMatch && hashMatch[1].trim(),
    parseable: !!(sourceMatch && versionMatch && compiledByMatch && hashMatch),
  };

  const promptPath = explicitPromptPath
    ? resolve(explicitPromptPath)
    : header.source
    ? resolve(dir, header.source)
    : null;

  const metaIsland = extractIsland(raw, "/*@meta*/");
  const spansIsland = metaIsland
    ? extractIsland(raw, "/*@spans*/", metaIsland.closeIdx)
    : extractIsland(raw, "/*@spans*/");

  // islands-stripped view: mask meta + spans island payloads (keep positions)
  let noIslands = raw;
  if (spansIsland) noIslands = mask(noIslands, spansIsland.jsonStart, spansIsland.endIdx);
  if (metaIsland) noIslands = mask(noIslands, metaIsland.jsonStart, metaIsland.endIdx);

  // islands + P table stripped view, for the literal-length gate
  const noIslandsNoP = maskConstObjectBlock(noIslands, "P");

  return { raw, header, promptPath, metaIsland, spansIsland, noIslands, noIslandsNoP };
}

// ---------- individual gates ----------

// This gate recomputes against the version stamped in the artifact's OWN
// header (a.header.version), not the currently-installed VERSION file. It is
// a self-consistency check — "is this hash correct for the inputs it claims?"
// — not a staleness check. Detecting "VERSION was bumped since this artifact
// was compiled" is auto-make's job (design.md §9.1), which compares the
// header hash against a hash computed from the CURRENT VERSION file; that
// comparison must happen in SKILL.md's auto-make step, not here.
function gate1_headerHash(a) {
  if (!a.header.parseable) {
    return { pass: false, detail: "header unparsable — missing source/my-precious-version/compiled-by/hash line" };
  }
  if (!a.promptPath) {
    return { pass: false, detail: "no prompt path resolvable (no // source: line and none supplied via --prompt)" };
  }
  let promptBytes;
  try {
    promptBytes = readFileSync(a.promptPath);
  } catch (e) {
    return { pass: false, detail: `cannot read source prompt at ${a.promptPath}: ${e.message}` };
  }
  const recomputed = computeHash(a.header.version, promptBytes);
  if (recomputed !== a.header.hash) {
    return {
      pass: false,
      detail: `header hash ${a.header.hash} != recomputed ${recomputed} (version=${a.header.version}, prompt=${a.promptPath})`,
    };
  }
  return { pass: true, detail: "header parses; hash matches recomputation" };
}

function gate2_syntax(a) {
  if (!a.metaIsland) {
    return { pass: false, detail: "no /*@meta*/ island found — cannot locate wrap point" };
  }
  const head = a.raw.slice(0, a.metaIsland.closeIdx);
  const tail = a.raw.slice(a.metaIsland.closeIdx);
  let transformed = head + "\nasync function __body() {\n" + tail + "\n}\n";
  // strip the export keyword on `const meta` (mirrors the runtime's own wrapping,
  // which does not use ESM export — design.md §7 gate 2)
  transformed = transformed.replace("export const meta", "const meta");

  const tmpFile = resolve(tmpdir(), `mp-check-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, transformed, "utf8");
  try {
    execFileSync(process.execPath, ["--check", tmpFile], { stdio: ["ignore", "pipe", "pipe"] });
    return { pass: true, detail: "node --check succeeded on wrapped transform" };
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : e.message;
    return { pass: false, detail: `node --check failed: ${stderr.split("\n").slice(0, 3).join(" | ")}` };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function gate3_metaIsland(a) {
  if (!a.metaIsland) return { pass: false, detail: "no /*@meta*/ island found" };
  let metaObj;
  try {
    metaObj = JSON.parse(a.metaIsland.jsonText);
  } catch (e) {
    return { pass: false, detail: `meta island JSON.parse failed: ${e.message}` };
  }
  // Validate independently of parse success, but always hand back metaObj —
  // gate 9 needs meta.phases regardless of whether gate 3 itself passes, so
  // a name/description defect here doesn't spuriously cross-trip gate 9.
  const problems = [];
  if (typeof metaObj.name !== "string" || metaObj.name.length === 0) {
    problems.push("meta.name missing or not a non-empty string");
  }
  if (typeof metaObj.description !== "string" || metaObj.description.length === 0) {
    problems.push("meta.description missing or not a non-empty string");
  }
  if (metaObj.phases !== undefined) {
    if (!Array.isArray(metaObj.phases)) {
      problems.push("meta.phases present but not an array");
    } else {
      for (const [i, p] of metaObj.phases.entries()) {
        if (!p || typeof p.title !== "string" || p.title.length === 0) {
          problems.push(`meta.phases[${i}].title missing or not a non-empty string`);
        }
      }
    }
  }
  if (problems.length > 0) {
    return { pass: false, detail: problems.join("; "), metaObj };
  }
  return { pass: true, detail: `meta parses; name="${metaObj.name}"`, metaObj };
}

function gate4_spansIsland(a) {
  if (!a.spansIsland) return { pass: false, detail: "no /*@spans*/ island found" };
  let spansObj;
  try {
    spansObj = JSON.parse(a.spansIsland.jsonText);
  } catch (e) {
    return { pass: false, detail: `S island JSON.parse failed: ${e.message}` };
  }
  if (!a.promptPath) {
    return { pass: false, detail: "no prompt path resolvable to verify span verbatim-ness" };
  }
  let promptText;
  try {
    promptText = readFileSync(a.promptPath, "utf8");
  } catch (e) {
    return { pass: false, detail: `cannot read source prompt at ${a.promptPath}: ${e.message}` };
  }
  const entries = Object.entries(spansObj);
  if (entries.length === 0) {
    return { pass: false, detail: "S island is empty" };
  }
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.length === 0) {
      return { pass: false, detail: `S["${key}"] is not a non-empty string` };
    }
    if (!promptText.includes(value)) {
      return { pass: false, detail: `S["${key}"] is not a byte-substring of ${a.promptPath}` };
    }
  }
  return { pass: true, detail: `${entries.length} span(s), all byte-verbatim substrings of the prompt` };
}

function gate5_forbiddenApis(a) {
  for (const { name, re } of FORBIDDEN_API_PATTERNS) {
    const m = a.noIslands.match(re);
    if (m) {
      const idx = a.noIslands.indexOf(m[0]);
      const line = a.noIslands.slice(0, idx).split("\n").length;
      return { pass: false, detail: `forbidden API "${name}" found at line ${line}` };
    }
  }
  return { pass: true, detail: "no forbidden APIs found outside islands" };
}

function gate6_envelopeDiscipline(a) {
  const code = a.noIslands;
  const offenders = new Set();

  const destructureRe = /const\s*\{([^}]*)\}\s*=\s*args\b/g;
  let m;
  while ((m = destructureRe.exec(code))) {
    const fields = m[1]
      .split(",")
      .map((f) => f.split(":")[0].split("=")[0].trim())
      .filter(Boolean);
    for (const f of fields) {
      if (!ALLOWED_ENVELOPE_FIELDS.includes(f)) offenders.add(f);
    }
  }

  const dotAccessRe = /\bargs\.(\w+)/g;
  while ((m = dotAccessRe.exec(code))) {
    if (!ALLOWED_ENVELOPE_FIELDS.includes(m[1])) offenders.add(m[1]);
  }

  if (offenders.size > 0) {
    return { pass: false, detail: `undocumented envelope field(s) accessed: ${[...offenders].join(", ")}` };
  }
  return { pass: true, detail: "only documented envelope fields accessed" };
}

function gate7_stringLiteralLength(a) {
  const code = a.noIslandsNoP;
  const stringRe = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = stringRe.exec(code))) {
    const content = m[0].slice(1, -1);
    if (content.length > MAX_LITERAL_LEN) {
      const line = code.slice(0, m.index).split("\n").length;
      return {
        pass: false,
        detail: `string literal of length ${content.length} (> ${MAX_LITERAL_LEN}) at line ${line}, outside islands and the P table`,
      };
    }
  }
  return { pass: true, detail: `no string literal > ${MAX_LITERAL_LEN} chars outside islands/P` };
}

function gate8_resultContract(a) {
  const code = a.noIslands;
  const returnRe = /return\s*\{/g;
  let m;
  let count = 0;
  const bad = [];
  while ((m = returnRe.exec(code))) {
    const openBrace = m.index + m[0].length - 1;
    const closeBrace = findMatchingBrace(code, openBrace);
    if (closeBrace === -1) {
      bad.push(`unbalanced object literal at offset ${m.index}`);
      continue;
    }
    const objText = code.slice(openBrace, closeBrace + 1);
    const statusMatch = objText.match(/status\s*:\s*["'](\w+)["']/);
    count++;
    if (!statusMatch) {
      const line = code.slice(0, m.index).split("\n").length;
      bad.push(`return at line ${line} has no status: literal`);
      continue;
    }
    if (!RESULT_STATUSES.includes(statusMatch[1])) {
      const line = code.slice(0, m.index).split("\n").length;
      bad.push(`return at line ${line} has status "${statusMatch[1]}" not in ${JSON.stringify(RESULT_STATUSES)}`);
    }
  }
  if (count === 0) {
    return { pass: false, detail: "no top-level `return { ... }` found" };
  }
  if (bad.length > 0) {
    return { pass: false, detail: bad.join("; ") };
  }
  return { pass: true, detail: `${count} return(s), all valid result-contract objects` };
}

function gate9_phaseAndWorkflow(a, metaObj) {
  const code = a.noIslands;
  if (code.includes("workflow(")) {
    const idx = code.indexOf("workflow(");
    const line = code.slice(0, idx).split("\n").length;
    return { pass: false, detail: `"workflow(" found at line ${line} — nesting is out of scope for v1` };
  }
  const declaredTitles = new Set((metaObj && metaObj.phases) ? metaObj.phases.map((p) => p.title) : []);
  const usedTitles = new Set();

  const globalPhaseRe = /\bphase\(\s*"([^"]+)"\s*\)/g;
  let m;
  while ((m = globalPhaseRe.exec(code))) usedTitles.add(m[1]);
  const optsPhaseRe = /\bphase\s*:\s*"([^"]+)"/g;
  while ((m = optsPhaseRe.exec(code))) usedTitles.add(m[1]);

  const orphans = [...usedTitles].filter((t) => !declaredTitles.has(t));
  if (orphans.length > 0) {
    return { pass: false, detail: `phase title(s) not in meta.phases: ${orphans.join(", ")}` };
  }
  return { pass: true, detail: `no "workflow(" found; ${usedTitles.size} phase title(s) all declared in meta.phases` };
}

function gate10_sizeSanity(a, artifactPath) {
  const size = statSync(artifactPath).size;
  if (size >= MAX_ARTIFACT_BYTES) {
    return { pass: false, detail: `artifact is ${size} bytes, >= ${MAX_ARTIFACT_BYTES}` };
  }
  return { pass: true, detail: `artifact is ${size} bytes` };
}

// ---------- runner ----------

export function runChecks(artifactPath, promptPathOverride) {
  const a = loadArtifact(artifactPath, promptPathOverride);
  const g1 = gate1_headerHash(a);
  const g2 = gate2_syntax(a);
  const g3 = gate3_metaIsland(a);
  const g4 = gate4_spansIsland(a);
  const g5 = gate5_forbiddenApis(a);
  const g6 = gate6_envelopeDiscipline(a);
  const g7 = gate7_stringLiteralLength(a);
  const g8 = gate8_resultContract(a);
  const g9 = gate9_phaseAndWorkflow(a, g3.metaObj);
  const g10 = gate10_sizeSanity(a, artifactPath);

  const gates = [
    { n: 1, name: "header parses; hash matches", ...g1 },
    { n: 2, name: "syntax (wrapped node --check)", ...g2 },
    { n: 3, name: "meta island well-formed", ...g3 },
    { n: 4, name: "S island well-formed + verbatim", ...g4 },
    { n: 5, name: "forbidden APIs absent", ...g5 },
    { n: 6, name: "envelope discipline", ...g6 },
    { n: 7, name: "string-literal length rule", ...g7 },
    { n: 8, name: "result contract", ...g8 },
    { n: 9, name: "no workflow(); phase titles declared", ...g9 },
    { n: 10, name: "size sanity", ...g10 },
  ].map(({ metaObj, ...rest }) => rest); // don't leak the parsed object into the report

  const overallPass = gates.every((g) => g.pass);
  return { artifactPath, overallPass, gates };
}

function printReport(report) {
  console.log(`\n${report.artifactPath}`);
  for (const g of report.gates) {
    const mark = g.pass ? "PASS" : "FAIL";
    console.log(`  [${mark}] gate ${g.n}: ${g.name} — ${g.detail}`);
  }
  console.log(report.overallPass ? "  => ALL GATES PASS\n" : "  => FAILED\n");
}

function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes("--json");
  const rest = argv.filter((x) => x !== "--json");
  const artifactPath = rest[0];
  const promptFlagIdx = rest.indexOf("--prompt");
  const promptPathOverride = promptFlagIdx !== -1 ? rest[promptFlagIdx + 1] : undefined;

  if (!artifactPath) {
    console.error("usage: node check.mjs <artifact.js> [--prompt <prompt.md>] [--json]");
    process.exit(2);
  }

  const report = runChecks(artifactPath, promptPathOverride);
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  process.exit(report.overallPass ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
