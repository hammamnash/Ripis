import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
let walletId = "";
let categoryId = "";
let rowId = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  const w = await prisma.wallet.create({ data: { user_id: user.id, name: "Delete Wallet", wallet_type: "cash" as const, is_liability: false, currency_id: "E2E", opening_balance: "0", current_balance: "0" } });
  walletId = w.id;
  const c = await prisma.category.create({ data: { user_id: user.id, name: "Delete Category", type: "expense", color: "#D22129" } });
  categoryId = c.id;
  const r = await prisma.transaction.create({ data: { user_id: user.id, wallet_id: walletId, category_id: categoryId, transaction_type: "expense", occurred_on: new Date(), amount: "7000.0000", base_amount: "7000.0000", currency_id: "E2E", base_currency_id: "E2E", description: "Delete me" } });
  rowId = r.id;
});

test("deleting a transaction takes it out of the ledger", async ({ page }) => {
  await page.goto(`/transactions/${rowId}`);
  await page.getByText("Delete this transaction").click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  const live = await prisma.transaction.count({ where: { id: rowId, deleted_at: null } });
  expect(live).toBe(0);
  const w = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  expect(w.current_balance.equals(0)).toBe(true);
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: walletId } });
  await prisma.wallet.delete({ where: { id: walletId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});
