import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

/*
 * Task B (FR-09, ADR-0017). The handoff's spec: type the real balance on the wallet screen, assert
 * the stored balance equals it and exactly one row exists.
 *
 * "Exactly one row" is the half that separates a reconcile from a re-entry. A screen that wrote the
 * balance directly would change the number and leave the ledger's story untold; a screen that filed
 * a row per click would file two. The row is asserted by count and by shape — an ordinary expense
 * noted `Balance Difference` — because ADR-0017's whole argument is that a reconciliation is a row
 * like any other, and the note is its only marker.
 *
 * The liability inversion is NOT re-proved here (test/reconciliation.spec.ts owns it against the
 * real module); what this spec adds is the browser leg: the preview the screen promises and the row
 * the server files must be the same direction, seen through the form.
 */
const prisma = new PrismaClient();

/** The reconcile panel arrives folded, so the fields a spec types into are not on screen until it is opened. */
async function openReconcile(page: Page) {
  await page.getByTestId("reconcile-toggle").click();
  await expect(page.getByLabel("Balance on your statement")).toBeVisible();
}

let walletId = "";
let expenseCategoryId = "";
let incomeCategoryId = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  const w = await prisma.wallet.create({
    data: {
      user_id: user.id,
      name: "Reconcile Wallet",
      wallet_type: "cash" as const,
      is_liability: false,
      currency_id: "E2E",
      /* The opening balance IS the balance: with no rows, `recomputeBalance` returns the opening figure,
         which is the state `createWallet` actually produces. A wallet whose stored balance and rows
         disagree would make the screen promise one direction and the server derive the other — the
         preview reads the stored figure because that is the number the user is reconciling against. */
      opening_balance: "1000000.0000",
      current_balance: "1000000.0000",
    },
  });
  walletId = w.id;
  const expense = await prisma.category.create({
    data: { user_id: user.id, name: "Rec Expense Cat", type: "expense", color: "#D22129" },
  });
  expenseCategoryId = expense.id;
  const income = await prisma.category.create({
    data: { user_id: user.id, name: "Rec Income Cat", type: "income", color: "#16653F" },
  });
  incomeCategoryId = income.id;
});

test("reconciling down files one expense and lands the balance on the statement figure", async ({ page }) => {
  await page.goto(`/wallets/${walletId}`);

  /* Folded until asked: a wallet's screen is its ledger, and reconciling is a correction to it. */
  await expect(page.getByLabel("Balance on your statement")).toBeHidden();
  await openReconcile(page);

  await page.getByLabel("Balance on your statement").fill("950000");

  /* The preview is the promise: an expense of 50.000, stated before anything is submitted. */
  await expect(page.getByTestId("reconcile-direction")).toHaveText("expense");

  await page.getByLabel("Category").selectOption(expenseCategoryId);
  await page.getByRole("button", { name: "Reconcile wallet" }).click();

  /* The click starts a server action whose response revalidates the page; the URL never changes, so
     waiting on it would pass instantly and read the database before the action has run. Poll the
     effect itself: the row is the promise that the round trip completed. */
  await expect
    .poll(() => prisma.transaction.count({ where: { wallet_id: walletId, deleted_at: null } }))
    .toBe(1);

  const rows = await prisma.transaction.findMany({
    where: { wallet_id: walletId, deleted_at: null },
  });
  expect(rows).toHaveLength(1);
  const filed = rows.find((row) => row.notes === "Balance Difference");
  expect(filed?.transaction_type).toBe("expense");
  expect(filed?.amount.toFixed(4)).toBe("50000.0000");
  expect(filed?.notes).toBe("Balance Difference");

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  expect(wallet.current_balance.toFixed(4)).toBe("950000.0000");
});

test("reconciling up files an income", async ({ page }) => {
  await page.goto(`/wallets/${walletId}`);

  await openReconcile(page);
  await page.getByLabel("Balance on your statement").fill("1000000");
  await expect(page.getByTestId("reconcile-direction")).toHaveText("income");

  await page.getByLabel("Category").selectOption(incomeCategoryId);
  await page.getByRole("button", { name: "Reconcile wallet" }).click();

  await expect
    .poll(() =>
      prisma.transaction.count({
        where: { wallet_id: walletId, deleted_at: null, notes: "Balance Difference" },
      }),
    )
    .toBe(2);

  const rows = await prisma.transaction.findMany({
    where: { wallet_id: walletId, deleted_at: null, notes: "Balance Difference" },
  });
  expect(rows).toHaveLength(2); // the expense above plus this income — both ordinary rows
  expect(rows.filter((row) => row.transaction_type === "income")).toHaveLength(1);

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  expect(wallet.current_balance.toFixed(4)).toBe("1000000.0000");
});

test("a statement that already matches is refused on the screen, not filed", async ({ page }) => {
  await page.goto(`/wallets/${walletId}`);

  await openReconcile(page);
  await page.getByLabel("Balance on your statement").fill("1000000");
  await expect(page.getByTestId("reconcile-preview")).toHaveCount(0);
  await expect(page.getByText("already holds")).toBeVisible();

  const rows = await prisma.transaction.count({ where: { wallet_id: walletId, deleted_at: null } });
  expect(rows).toBe(2);
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: walletId } });
  await prisma.wallet.delete({ where: { id: walletId } });
  await prisma.category.delete({ where: { id: expenseCategoryId } });
  await prisma.category.delete({ where: { id: incomeCategoryId } });
  await prisma.$disconnect();
});
