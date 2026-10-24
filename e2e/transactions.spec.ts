import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

/*
 * The list screen cannot be verified from an empty ledger, and an empty ledger is what the database has. So
 * this spec builds the smallest real one: a wallet and a category, then a transaction entered through the
 * form itself — the write path, not an INSERT. Cleanup is in `afterAll` so a failure does not leave a wallet
 * behind for the Vitest suite to trip over.
 */
const prisma = new PrismaClient();
const EMAIL = "e2e-spec@ripis.test";
const WALLET = "Verification Wallet";
const CATEGORY = "Verification Category";

let walletId = "";
let categoryId = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const wallet = await prisma.wallet.create({
    data: {
      user_id: user.id,
      name: WALLET,
      wallet_type: "cash",
      is_liability: false,
      currency_id: "E2E",
      opening_balance: "0",
      current_balance: "0",
    },
  });
  walletId = wallet.id;
  const category = await prisma.category.create({
    data: { user_id: user.id, name: CATEGORY, type: "expense", color: "#D22129" },
  });
  categoryId = category.id;
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: walletId } });
  await prisma.wallet.delete({ where: { id: walletId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});

test("a transaction entered on the form is filed and listed", async ({ page }) => {
  await page.goto("/transactions/new");

  await page.locator('input[name="amount"]').fill("250000");
  await page.locator('select[name="walletId"]').selectOption({ label: WALLET });
  await page.locator('select[name="categoryId"]').selectOption({ label: CATEGORY });
  await page.locator('input[name="description"]').fill("Verification expense");
  await page.locator("form").getByRole("button", { name: /save/i }).click();

  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByText("Verification expense")).toBeVisible();

  /* A row is a link; a link to a route that does not exist is a 404, and a 404 still "renders". */
  await page.getByText("Verification expense").click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);
  await expect(page.locator('[data-slot="transaction-detail"]')).toBeVisible();
  await expect(page.getByText("Recorded in the base currency as")).toBeVisible();
  await expect(page.getByText("250.000").first()).toBeVisible();
});

/*
 * The row prints its category and wallet on the caption line, so a search that could not find either of them
 * reported "no matching rows" while the matching row sat on screen — the caption is what `?q=` has to reach
 * (FR-13), not only the free-text columns.
 */
test("search matches the row's caption, and back returns to the filtered list", async ({ page }) => {
  await page.goto(`/transactions?q=${encodeURIComponent(CATEGORY)}`);
  await expect(page.getByText("Verification expense")).toBeVisible();

  await page.goto(`/transactions?q=${encodeURIComponent(WALLET)}`);
  await expect(page.getByText("Verification expense")).toBeVisible();

  await page.getByText("Verification expense").click();
  const back = page.getByTestId("shell-back");
  await expect(back).toBeVisible();
  await back.click();

  /* Back steps through history rather than hard-linking to a bare list: the filter the user left is still in
     the previous entry, and a back button that quietly drops it is a back button that loses their place. */
  await expect(page).toHaveURL(/\/transactions\?q=Verification/);
  await expect(page.getByText("Verification expense")).toBeVisible();
});
