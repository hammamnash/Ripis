import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
let fromId = "";
let toId = "";
test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  const base = { user_id: user.id, wallet_type: "cash" as const, is_liability: false, currency_id: "E2E", opening_balance: "0", current_balance: "0" };
  fromId = (await prisma.wallet.create({ data: { ...base, name: "Transfer From" } })).id;
  toId = (await prisma.wallet.create({ data: { ...base, name: "Transfer To" } })).id;
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: { in: [fromId, toId] } } });
  await prisma.wallet.deleteMany({ where: { id: { in: [fromId, toId] } } });
  await prisma.$disconnect();
});

test("a transfer leaves one wallet and lands in the other", async ({ page }) => {
  await page.goto("/transactions/new");
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.locator('input[name="amount"]').fill("50000");
  await page.locator('select[name="walletId"]').selectOption(fromId);
  await page.locator('select[name="destinationWalletId"]').selectOption(toId);
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/\/transactions(\?|$)/);
  const from = await prisma.wallet.findUniqueOrThrow({ where: { id: fromId } });
  const to = await prisma.wallet.findUniqueOrThrow({ where: { id: toId } });
  expect(from.current_balance.equals(-50000)).toBe(true);
  expect(to.current_balance.equals(50000)).toBe(true);
});
