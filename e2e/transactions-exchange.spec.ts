import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

/*
 * Task C (FR-08, ADR-0004). The exchange leg has never run through the screen: the same-currency spec
 * proves one amount leaves and arrives, but a cross-currency movement stores a SECOND amount — what
 * actually landed — and the arriving leg is `destination_amount ?? amount`. If the form ever dropped the
 * field or the server swapped the two, the destination wallet would silently hold the wrong currency's
 * figure.
 *
 * Both balances are asserted because the handoff names both: -100.0000 out of E2E, +6.5000 into USD.
 * The row's type stays `transfer` — the screen has no exchange button and the ledger arithmetic treats
 * the two identically (ADR-0004); the cross-currency fact is carried by destination_amount, not by type.
 */
const prisma = new PrismaClient();
let fromId = "";
let toId = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });

  /* A run that died between the two wallet creates leaves one behind; sweep by name before seeding so
     the fixture is the same shape every run rather than accumulating "Exchange From E2E" #4. */
  await prisma.transaction.deleteMany({
    where: { wallet: { name: { in: ["Exchange From E2E", "Exchange To USD"] } } },
  });
  await prisma.wallet.deleteMany({
    where: { name: { in: ["Exchange From E2E", "Exchange To USD"] } },
  });

  /* USD is seeded by the dev seed; when it is absent the spec creates it and removes it again, the way
     global-setup.ts does for E2E. */
  const usd = await prisma.currency.upsert({
    where: { code: "USD" },
    update: {},
    create: { code: "USD", name: "US Dollar", symbol: "$", minor_unit: 2, suffix: false },
  });

  fromId = (
    await prisma.wallet.create({
      data: {
        user_id: user.id,
        name: "Exchange From E2E",
        wallet_type: "cash" as const,
        is_liability: false,
        currency_id: "E2E",
        opening_balance: "200000.0000",
        current_balance: "200000.0000",
      },
    })
  ).id;
  toId = (
    await prisma.wallet.create({
      data: {
        user_id: user.id,
        name: "Exchange To USD",
        wallet_type: "checking_account" as const,
        is_liability: false,
        currency_id: usd.code,
        opening_balance: "0",
        current_balance: "0",
      },
    })
  ).id;
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { OR: [{ wallet_id: fromId }, { destination_wallet_id: toId }] } });
  await prisma.wallet.deleteMany({ where: { id: { in: [fromId, toId] } } });
  await prisma.$disconnect();
});

test("a cross-currency transfer moves both wallets by their own amounts", async ({ page }) => {
  await page.goto("/transactions/new");
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.locator('select[name="walletId"]').selectOption(fromId);
  await page.locator('select[name="destinationWalletId"]').selectOption(toId);

  /* The field is conditional: it appears only once the two picks differ in currency, which is the
     screen's way of asking "and what did the exchange give you?". */
  await expect(page.getByLabel("Amount received")).toBeVisible();

  await page.locator('input[name="amount"]').fill("100000");
  await page.locator('input[name="destinationAmount"]').fill("6.5");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/\/transactions(\?|$)/);

  const from = await prisma.wallet.findUniqueOrThrow({ where: { id: fromId } });
  const to = await prisma.wallet.findUniqueOrThrow({ where: { id: toId } });
  expect(from.current_balance.toFixed(4)).toBe("100000.0000"); // 200.0000 - 100.0000
  expect(to.current_balance.toFixed(4)).toBe("6.5000"); // the arriving figure, not the departing one

  const row = await prisma.transaction.findFirstOrThrow({
    where: { wallet_id: fromId, destination_wallet_id: toId, deleted_at: null },
  });
  expect(row.transaction_type).toBe("transfer");
  expect(row.amount.toFixed(4)).toBe("100000.0000");
  expect(row.destination_amount?.toFixed(4)).toBe("6.5000");
});

test("a wallet outside the primary currency is refused with the server's sentence, not silently filed", async ({ page }) => {
  /* ADR-0004: `base_amount` is stated or inferable, never looked up. When the SOURCE wallet holds the
     primary currency the figure infers itself; when it does not, the caller has to state it — and the
     screen has no field for that statement. This test pins the current behaviour: the row is refused
     with `base_amount_required`'s message shown on the form, and nothing is written. If a later task
     adds the field, this test flips from "refused" to "filed" — which is why it asserts the refusal
     through the UI, not just through the module. */
  await page.goto("/transactions/new");
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.locator('select[name="walletId"]').selectOption(toId); // USD, the primary is E2E
  await page.locator('select[name="destinationWalletId"]').selectOption(fromId);
  await page.locator('input[name="amount"]').fill("2");
  await page.locator('input[name="destinationAmount"]').fill("30000");
  await page.getByRole("button", { name: /save/i }).click();

  await expect(page.getByTestId("transaction-form-error")).toContainText("has to be stated");

  const filed = await prisma.transaction.count({
    where: { wallet_id: toId, destination_wallet_id: fromId, deleted_at: null },
  });
  expect(filed).toBe(0);
});
