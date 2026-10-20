import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

/*
 * A list that silently stops at page one looks like data loss, not like pagination. This spec fills a month
 * past the page size so the pager has to exist, then walks it.
 */
const prisma = new PrismaClient();
const EMAIL = "e2e-spec@ripis.test";
const ROWS = 101;

let walletId = "";
let categoryId = "";
let month = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const now = new Date();
  month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const wallet = await prisma.wallet.create({
    data: {
      user_id: user.id,
      name: "Paging Wallet",
      wallet_type: "cash",
      is_liability: false,
      currency_id: "E2E",
      opening_balance: "0",
      current_balance: "0",
    },
  });
  walletId = wallet.id;

  /* The transaction table carries a check constraint: an expense or an income must name a category
     (`income_expense_need_category`). A seed that forgets one is refused by Postgres, not by the app. */
  const category = await prisma.category.create({
    data: { user_id: user.id, name: "Paging Category", type: "expense", color: "#D22129" },
  });
  categoryId = category.id;

  await prisma.transaction.createMany({
    data: Array.from({ length: ROWS }, (_, index) => ({
      user_id: user.id,
      wallet_id: wallet.id,
      category_id: category.id,
      transaction_type: "expense",
      occurred_on: new Date(`${month}-01T00:00:00.000Z`),
      amount: "10000.0000",
      currency_id: "E2E",
      base_amount: "10000.0000",
      base_currency_id: "E2E",
      description: `Bulk row ${index + 1}`,
    })),
  });
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: walletId } });
  await prisma.wallet.delete({ where: { id: walletId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});

test("a month longer than one page offers its older rows", async ({ page }) => {
  await page.goto(`/transactions?month=${month}`);

  const pager = page.locator('[data-slot="transaction-pager"]');
  await expect(pager).toBeVisible();
  await expect(page.locator('[data-slot="transaction-day"]').first()).toBeVisible();

  await page.getByRole("link", { name: "Older" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('[data-slot="transaction-day"]').first()).toBeVisible();
});
