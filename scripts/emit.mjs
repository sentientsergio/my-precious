#!/usr/bin/env node
// my-precious — scripts/emit.mjs
//
// Resolves $SPAN(start,end) placeholders in a compiler draft by copying the
// exact (byte-verbatim) lines from the source prompt, then stamps the
// five-line artifact header (design.md §3.1) including the content hash
// (design.md §9.1: mp1: + SHA-256 hex over UTF-8 (VERSION + "\n" + raw prompt
// bytes)). The model never retypes source text — this script does the
// copying, mechanically.
//
// CLI:
//   node scripts/emit.mjs --draft <draft.js> --prompt <prompt.md> \
//        --version <semver> --compiled-by <model> --out <artifact.js>
//
// Programmatic:
//   import { emit, computeHash, resolveSpans } from "./emit.mjs";

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const SPAN_RE = /"\$SPAN\((\d+)\s*,\s*(\d+)\)"/g;

/**
 * mp1:<sha256 hex> over UTF-8 (version + "\n" + raw prompt bytes).
 * @param {string} version
 * @param {Buffer} promptBytes
 */
export function computeHash(version, promptBytes) {
  const h = createHash("sha256");
  h.update(Buffer.from(version + "\n", "utf8"));
  h.update(promptBytes);
  return "mp1:" + h.digest("hex");
}

/**
 * Extract 1-indexed inclusive line range [start,end] from prompt text,
 * joined with "\n" — the byte-exact excerpt design.md §3.2 requires.
 */
function extractLines(promptLines, start, end) {
  if (start < 1 || end < start || end > promptLines.length) {
    throw new Error(
      `$SPAN(${start},${end}) out of range — prompt has ${promptLines.length} lines`
    );
  }
  return promptLines.slice(start - 1, end).join("\n");
}

/**
 * Replace every "$SPAN(a,b)" placeholder in draftText with the
 * JSON-stringified verbatim excerpt from promptText. Throws immediately,
 * naming every out-of-range placeholder found in the pass, if any $SPAN
 * can't be resolved against the prompt's actual line count — this is a
 * compiler-draft defect, not something emit.mjs should paper over.
 */
export function resolveSpans(draftText, promptText) {
  // Split preserving line content; prompt.md may use \n or \r\n — normalize
  // splitting on \n only and leave \r as part of content if present (raw
  // fidelity), since check.mjs's substring test compares against promptText
  // read the same way.
  const promptLines = promptText.split("\n");
  const badSpans = [];
  const out = draftText.replace(SPAN_RE, (match, startStr, endStr) => {
    const start = Number(startStr);
    const end = Number(endStr);
    try {
      return JSON.stringify(extractLines(promptLines, start, end));
    } catch (e) {
      badSpans.push(`$SPAN(${startStr},${endStr}): ${e.message}`);
      return match;
    }
  });
  if (badSpans.length > 0) {
    throw new Error(`unresolved span(s):\n  ${badSpans.join("\n  ")}`);
  }
  return { text: out };
}

/**
 * Stamp the five-line header (design.md §3.1) onto span-resolved artifact
 * body text.
 */
export function stampHeader({ body, sourceBasename, version, compiledBy, hash }) {
  const header =
    `// my-precious artifact — regenerable; do not hand-edit. Edit the source prompt and re-invoke /my-precious.\n` +
    `// source: ${sourceBasename}\n` +
    `// my-precious-version: ${version}\n` +
    `// compiled-by: ${compiledBy}\n` +
    `// hash: ${hash}\n`;
  return header + body;
}

/**
 * Full emit: draft (with $SPAN placeholders, starting "export const meta = ...")
 * + prompt.md -> stamped, span-resolved artifact text.
 */
export function emit({ draftText, promptText, promptBytes, sourceBasename, version, compiledBy }) {
  const { text: body } = resolveSpans(draftText, promptText);
  const hash = computeHash(version, promptBytes);
  return stampHeader({ body, sourceBasename, version, compiledBy, hash });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      args[key] = val;
      i++;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { draft, prompt, version, out } = args;
  const compiledBy = args["compiled-by"];
  if (!draft || !prompt || !version || !compiledBy || !out) {
    console.error(
      "usage: node emit.mjs --draft <draft.js> --prompt <prompt.md> --version <semver> --compiled-by <model> --out <artifact.js>"
    );
    process.exit(2);
  }
  const draftText = readFileSync(draft, "utf8");
  const promptBytes = readFileSync(prompt);
  const promptText = promptBytes.toString("utf8");
  const sourceBasename = basename(prompt);
  const artifactText = emit({
    draftText,
    promptText,
    promptBytes,
    sourceBasename,
    version,
    compiledBy,
  });
  writeFileSync(out, artifactText, "utf8");
  console.log(`emitted ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
