import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

/*
 * Task D (FR-12, ADR-0008). The server half of the round trip is tested in
 * `test/import-cashbook.spec.ts`; what has never run is the screen: a file that leaves Settings through
 * the browser's download must be the same file that succeeds when it comes back through the file
 * input. The download is the seam — a component that dropped the filename, the content type, or the
 * base64 encoding would fail here and nowhere else.
 *
 * The order assertion (Export above Import) is the decided default from the handoff, and the count
 * assertions are the §12 requirement: the summary must agree with the database before the button is
 * clickable, and the import summary must agree with what was written.
 */
const prisma = new PrismaClient();
let walletId = "";
let categoryId = "";
let userId = "";

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  userId = user.id;

  /* A run that died mid-flight leaves rows behind; sweep by name first, the way the exchange spec does,
     so the fixture is the same shape every run. */
  await prisma.transaction.deleteMany({ where: { wallet: { name: "Settings Data Wallet" } } });
  await prisma.wallet.deleteMany({ where: { name: "Settings Data Wallet" } });
  await prisma.category.deleteMany({ where: { name: "Settings Data Category" } });

  const w = await prisma.wallet.create({
    data: {
      user_id: userId,
      name: "Settings Data Wallet",
      wallet_type: "cash" as const,
      is_liability: false,
      currency_id: "E2E",
      opening_balance: "100000.0000",
      // A direct insert does not move the balance, so the stored figure states the expense already happened.
      current_balance: "50000.0000",
    },
  });
  walletId = w.id;
  const c = await prisma.category.create({
    data: { user_id: userId, name: "Settings Data Category", type: "expense", color: "#D22129" },
  });
  categoryId = c.id;
  await prisma.transaction.create({
    data: {
      user_id: userId,
      wallet_id: walletId,
      category_id: categoryId,
      transaction_type: "expense",
      occurred_on: new Date(),
      amount: "50000.0000",
      base_amount: "50000.0000",
      currency_id: "E2E",
      base_currency_id: "E2E",
      description: "Settings Data",
    },
  });
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: walletId } });
  await prisma.wallet.delete({ where: { id: walletId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});

test("Settings shows Export above Import, counts the range, and round-trips the file", async ({ page }) => {
  await page.goto("/settings");

  // The decided default from the handoff: one Data section, Export first.
  await expect(page.locator('[data-testid="settings-data"] > div').first()).toHaveAttribute(
    "data-testid",
    "export-section",
  );

  /* A range wide enough that the summary counts every live row of the fixture account, whatever
     time-of-day semantics the calendar filter carries — the point is the count matching the database,
     not re-testing the range. */
  await page.locator('input[id="startDate"]').fill("2020-01-01");
  await page.locator('input[id="endDate"]').fill(isoDay(new Date()));

  await expect(page.getByTestId("export-summary")).toContainText(/transaction(s)? in this range/);

  const summaryText = (await page.getByTestId("export-summary").textContent()) ?? "";
  const inRange = Number(/\d+/.exec(summaryText)?.[0] ?? "-1");
  const dbCount = await prisma.transaction.count({ where: { user_id: userId, deleted_at: null } });
  expect(inRange).toBe(dbCount); // the summary is the export's own filter, not a guess at it

  const before = dbCount;
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download export" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^ripis-cashbook-2020-01-01~\d{4}-\d{2}-\d{2}\.xlsx$/);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();

  await page.setInputFiles('[data-testid="import-file"]', filePath as string);
  await page.getByRole("button", { name: "Import cashbook" }).click();

  await expect(page.getByTestId("import-summary")).toContainText(/Imported \d+ transactions/);
  const importText = (await page.getByTestId("import-summary").textContent()) ?? "";
  const imported = Number(/Imported (\d+)/.exec(importText)?.[1] ?? "-1");
  expect(imported).toBe(inRange); // every row the summary counted came back as a transaction

  const after = await prisma.transaction.count({ where: { user_id: userId, deleted_at: null } });
  expect(after).toBe(before + imported);

  /* The wallet is the proof the money landed, not just the rows: its two expenses are the original and
     the re-imported one, and nothing else moved it. */
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  expect(wallet.current_balance.toFixed(4)).toBe("0.0000"); // 100.0000 - 50.0000 - 50.0000
});
