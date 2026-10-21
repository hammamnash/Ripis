import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type SourceMap = Record<string, string>;
export type GateFailure = { rule: string; path: string; detail: string };

const MONEY_CALL = /\.(transaction|wallet)\.(findMany|findFirst|count|aggregate|groupBy)\(/;
const MONEY_NUMBER = /(Number|parseFloat)\(\s*(amount|base_amount|baseAmount|current_balance|currentBalance|opening_balance|openingBalance|destination_amount|destinationAmount)\b/;

function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

export function inspectPhase83Sources(files: SourceMap): GateFailure[] {
  const failures: GateFailure[] = [];
  for (const [path, raw] of Object.entries(files)) {
    const text = codeOnly(raw);
    const schema = path.replaceAll("\\", "/").endsWith("prisma/schema.prisma");
    const source = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path);

    if (source && MONEY_CALL.test(text) && !text.includes("deleted_at")) failures.push({ rule: "soft-delete", path, detail: "money query does not name deleted_at" });
    if (source && MONEY_NUMBER.test(text)) failures.push({ rule: "money-number", path, detail: "money value is converted to a JavaScript number" });
    if (schema && (/\bexchange_rate\b/.test(text) || /^\s*rate\s+\w/m.test(text))) failures.push({ rule: "exchange-rate", path, detail: "schema stores an exchange rate" });
    if (schema && /\b(model|enum)\s+(Tenant|Household|Family)\b|\b(tenant_id|household_id|family_id|group_id)\b/i.test(text)) failures.push({ rule: "tenant-model", path, detail: "schema introduces shared-ledger tenancy" });
    if (source && /["'](?:bullmq|redis)["']|\bnew\s+(Queue|Worker)\s*\(/.test(text)) failures.push({ rule: "worker-queue", path, detail: "background queue or worker introduced" });
    if (source && /toLocaleString\(\s*["']en-US["']/.test(text)) failures.push({ rule: "en-us-format", path, detail: "US locale formatting bypasses the money formatter" });
    if (schema && /\b(attachment|attachment_url|receipt_url|receiptUrl)\b/i.test(text)) failures.push({ rule: "attachment", path, detail: "schema introduces attachment storage" });
    if (schema) {
      const txType = /enum\s+TxType\s*\{([^}]*)\}/s.exec(text)?.[1] ?? "";
      if (/\badjustment\b/i.test(txType)) failures.push({ rule: "adjustment-type", path, detail: "TxType contains adjustment" });
    }
  }
  return failures;
}

function walk(root: string, directory: string, files: SourceMap): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "coverage"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(root, path, files);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|prisma)$/.test(entry.name)) files[relative(root, path).replaceAll("\\", "/")] = readFileSync(path, "utf8");
  }
}

export function inspectRepository(root: string): GateFailure[] {
  const files: SourceMap = {};
  for (const name of ["src", "app", "components", "prisma"]) walk(root, resolve(root, name), files);
  if (Object.keys(files).length < 40) return [{ rule: "coverage", path: root, detail: "source walk was suspiciously small" }];
  return inspectPhase83Sources(files);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const failures = inspectRepository(process.cwd());
  if (failures.length) {
    for (const failure of failures) console.error(`${failure.rule}: ${failure.path}: ${failure.detail}`);
    process.exitCode = 1;
  } else console.log("phase 8.3 mechanical gates: clean");
}
