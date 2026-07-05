#!/usr/bin/env node
// my-precious — fixtures/run-suite.mjs
//
// The one command that proves scripts/check.mjs and scripts/emit.mjs (design.md
// §3, §7, §9.1): the "good" fixture passes every F1 gate, and every tampered
// variant trips exactly the one gate it targets and no other.
//
// Usage: node fixtures/run-suite.mjs

import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runChecks } from "../scripts/check.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// variant dir name -> gate number expected to be the ONLY failure (0 = none, i.e. all-pass)
const EXPECTATIONS = {
  good: 0,
  "gate1-bad-hash": 1,
  "gate2-bad-syntax": 2,
  "gate3-bad-meta": 3,
  "gate4-bad-span": 4,
  "gate5-bad-date": 5,
  "gate6-bad-envelope": 6,
  "gate7-long-literal": 7,
  "gate8-bad-status": 8,
  "gate9-bad-phase": 9,
  "gate10-oversize": 10,
};

let failures = 0;
let passes = 0;

for (const [dirName, expectedFailingGate] of Object.entries(EXPECTATIONS)) {
  const dir = join(here, dirName);
  const artifactPath = join(dir, "prompt.workflow.js");
  if (!existsSync(artifactPath)) {
    console.error(`MISSING FIXTURE: ${artifactPath}`);
    failures++;
    continue;
  }
  const report = runChecks(artifactPath);
  const failingGates = report.gates.filter((g) => !g.pass).map((g) => g.n);

  let ok;
  let why;
  if (expectedFailingGate === 0) {
    ok = failingGates.length === 0;
    why = ok ? "all gates pass, as expected" : `expected all-pass, but gate(s) ${failingGates.join(",")} failed`;
  } else {
    ok = failingGates.length === 1 && failingGates[0] === expectedFailingGate;
    why = ok
      ? `gate ${expectedFailingGate} failed alone, as expected`
      : `expected exactly gate ${expectedFailingGate} to fail alone, but failing gate(s) were: [${failingGates.join(",")}]`;
  }

  console.log(`${ok ? "OK  " : "FAIL"}  ${dirName.padEnd(20)} ${why}`);
  if (!ok) {
    for (const g of report.gates) {
      if (!g.pass) console.log(`        gate ${g.n} (${g.name}): ${g.detail}`);
    }
    failures++;
  } else {
    passes++;
  }
}

console.log(`\n${passes}/${passes + failures} fixture expectations satisfied.`);
process.exit(failures === 0 ? 0 : 1);
