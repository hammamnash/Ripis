import { describe, expect, it } from "vitest";
import { inspectPhase83Sources } from "../scripts/phase8-mechanical-gates";

const clean = {
  "src/server/report.ts": `const rows = await db.transaction.findMany({ where: { deleted_at: null } });`,
  "prisma/schema.prisma": `model Transaction { base_amount Decimal }\nenum TxType { expense income transfer exchange }`,
  "components/amount.tsx": `export const Amount = ({ value }: { value: string }) => value;`,
};

describe("Phase 8.3 mechanical source gates", () => {
  it("accepts the intended architecture", () => {
    expect(inspectPhase83Sources(clean)).toEqual([]);
  });

  it.each([
    ["money query without soft delete", { ...clean, "src/server/report.ts": `db.transaction.findMany({ where: {} })` }, "soft-delete"],
    ["money converted to number", { ...clean, "src/server/report.ts": `Number(amount)` }, "money-number"],
    ["stored exchange rate", { ...clean, "prisma/schema.prisma": `model Transaction { exchange_rate Decimal }` }, "exchange-rate"],
    ["tenant model", { ...clean, "prisma/schema.prisma": `model Tenant { id String @id }` }, "tenant-model"],
    ["background worker dependency", { ...clean, "src/server/report.ts": `import { Queue } from "bullmq"` }, "worker-queue"],
    ["US number formatting", { ...clean, "components/amount.tsx": `amount.toLocaleString("en-US")` }, "en-us-format"],
    ["attachment storage", { ...clean, "prisma/schema.prisma": `model Transaction { receipt_url String? }` }, "attachment"],
    ["adjustment transaction type", { ...clean, "prisma/schema.prisma": `enum TxType { expense income adjustment }` }, "adjustment-type"],
  ])("rejects %s", (_name, files, rule) => {
    expect(inspectPhase83Sources(files).map((failure) => failure.rule)).toContain(rule);
  });
});
