import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

/*
 * Task A (FR-06). The handoff's one spec that matters: edit an expense 250000 → 300000 and prove the
 * wallet moved by 50000, not 300000.
 *
 * The assertion is on the stored balance after the edit, and the two failure modes it separates are very
 * different bugs. A ledger that added the new amount without reversing the old one would read
 * `-550000.0000` (money counted twice — a corruption bug, not a UI bug). A UI that posted the wrong
 * figure would fail the row assertion instead. `updateTransaction` rebuilds every touched wallet from the
 * live rows (`recomputeBalance`), so `-300000.0000` is the expected outcome — and this proves the rebuild
 * happens rather than trusting that it does.
 */
const prisma = new PrismaClient();
let walletId = "";
let categoryId = "";
let rowId = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  const w = await prisma.wallet.create({
    data: {
      user_id: user.id,
      name: "Edit Wallet",
      wallet_type: "cash" as const,
      is_liability: false,
      currency_id: "E2E",
      opening_balance: "0",
      current_balance: "-250000.0000",
    },
  });
  walletId = w.id;
  const c = await prisma.category.create({
    data: { user_id: user.id, name: "Edit Category", type: "expense", color: "#D22129" },
  });
  categoryId = c.id;
  const r = await prisma.transaction.create({
    data: {
      user_id: user.id,
      wallet_id: walletId,
      category_id: categoryId,
      transaction_type: "expense",
      occurred_on: new Date(),
      amount: "250000.0000",
      base_amount: "250000.0000",
      currency_id: "E2E",
      base_currency_id: "E2E",
      description: "Edit me",
    },
  });
  rowId = r.id;
});

test("editing an expense moves the balance by the difference, not the new amount", async ({ page }) => {
  await page.goto(`/transactions/${rowId}`);
  await page.getByRole("link", { name: "Edit this transaction" }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions/${rowId}/edit$`));

  /* The form must arrive pre-filled — an empty amount on an edit screen is a screen that invites the
     user to retype a figure they did not come here to change. */
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("250000");

  await page.getByLabel("Amount", { exact: true }).fill("300000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions/${rowId}$`));

  const row = await prisma.transaction.findUniqueOrThrow({ where: { id: rowId } });
  expect(row.amount.toFixed(4)).toBe("300000.0000");
  expect(row.base_amount.toFixed(4)).toBe("300000.0000");
  /* Fields the user did not touch survive the edit: `merged()` picks the current value for every absent
     key, and a lost description would mean the patch replaced the whole row with only what was sent. */
  expect(row.description).toBe("Edit me");
  expect(row.category_id).toBe(categoryId);

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  // -300000, not -550000: the old movement was reversed before the new one was counted.
  expect(wallet.current_balance.toFixed(4)).toBe("-300000.0000");
});

test("an edit into an illegal shape is refused with the server's own sentence", async ({ page }) => {
  await page.goto(`/transactions/${rowId}/edit`);
  /* A transfer needs a destination wallet, and the fixture account has only this one, so submitting the
     switch hits the rule in `prepareTransaction` and the message must reach the screen rather than
     arriving as a 500 or a silent no-op. The row is the proof: an edit that failed left it untouched. */
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByTestId("transaction-form-error")).toContainText("wallet to arrive in");
  const row = await prisma.transaction.findUniqueOrThrow({ where: { id: rowId } });
  expect(row.transaction_type).toBe("expense");
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: walletId } });
  await prisma.wallet.delete({ where: { id: walletId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});
