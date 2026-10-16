// scripts/check-doc-tables.mjs — markdown table arity guard.
// Run: node scripts/check-doc-tables.mjs
//
// Two failure modes, two checks:
//   1. Arity   — a row that lost a cell (or its closing pipe and a cell) renders
//                silently as wrong data. Counted the way a renderer counts:
//                leading/trailing pipes are optional, backslash-escaped pipes
//                do not delimit.
//   2. Marker  — a row whose *content* was truncated keeps its cell count, so
//                arity cannot see it. What it leaves behind is a literal
//                "[truncated]" in the file, which this greps for.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ".ai/01-prd.md",
  ".ai/02-context.md",
  ".ai/03-design.md",
  ".ai/decisions.md",
  ".ai/README.md",
  ".hermes.md",
  "README.md",
];

const MARKER = /\[truncated\]/;

const cells = (row) => {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).length;
};
const isSeparator = (row) => /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(row);
const isDataRow = (row) => row.trim().startsWith("|") && !isSeparator(row);

let bad = 0;
let checked = 0;

for (const rel of files) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    console.log(`${rel}: missing - skipped`);
    continue;
  }
  const lines = readFileSync(abs, "utf8").split(/\r?\n/);

  lines.forEach((line, idx) => {
    if (MARKER.test(line)) {
      bad += 1;
      console.log(`${rel}:${idx + 1} truncation marker left in file`);
    }
  });

  for (let i = 0; i < lines.length; i++) {
    if (!isSeparator(lines[i])) continue;
    const want = cells(lines[i - 1]);
    for (let j = i + 1; j < lines.length && isDataRow(lines[j]); j++) {
      checked += 1;
      const got = cells(lines[j]);
      if (got !== want) {
        bad += 1;
        console.log(`${rel}:${j + 1} expected ${want} cells, found ${got}`);
      }
    }
  }
}

console.log(bad === 0 ? `doc tables: clean (${checked} rows)` : `doc tables: ${bad} problem(s) of ${checked} rows`);
process.exit(bad === 0 ? 0 : 1);
