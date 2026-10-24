import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

/*
 * The Wallets tab is the second screen that used to consist of a heading and nothing else, and its cards
 * link to a detail route. A card that links to a route nobody built is a 404 wearing a card, so this spec
 * walks through it.
 */
const prisma = new PrismaClient();
const ASSET = "Verification Cash";
const LIABILITY = "Verification Card";
let userId = "";
const walletIds: string[] = [];

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  userId = user.id;

  const [cash, card] = await Promise.all([
    prisma.wallet.create({
      data: {
        user_id: userId,
        name: ASSET,
        wallet_type: "cash",
        is_liability: false,
        currency_id: "E2E",
        opening_balance: "0",
        current_balance: "1500000.0000",
      },
    }),
    prisma.wallet.create({
      data: {
        user_id: userId,
        name: LIABILITY,
        wallet_type: "credit_card",
        is_liability: true,
        currency_id: "E2E",
        opening_balance: "0",
        current_balance: "400000.0000",
      },
    }),
  ]);

  walletIds.push(cash.id, card.id);
});

test.afterAll(async () => {
  await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
  await prisma.$disconnect();
});

test("both sides of the balance sheet are listed, and a card opens its wallet", async ({ page }) => {
  await page.goto("/wallets");

  await expect(page.getByText("Net worth")).toBeVisible();
  await expect(page.getByText(ASSET, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(LIABILITY, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Assets", { exact: true })).toBeVisible();
  await expect(page.getByText("Liabilities", { exact: true })).toBeVisible();

  /* 1.500.000 asset minus 400.000 owed: the flag decides the sign, not the stored number. */
  await expect(page.getByText("1.100.000", { exact: false }).first()).toBeVisible();

  await page.getByText(ASSET, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/wallets\/[0-9a-f-]{36}/);

  /* Screen 7's ledger is screen 2 narrowed to one wallet: a month selector, the inverted band over that
     wallet's month, the type chips, and the rows beneath them. */
  await expect(page.getByTestId("month-selector")).toBeVisible();
  await expect(page.getByTestId("summary-band")).toBeVisible();
  await expect(page.getByRole("group", { name: "Filter by type" })).toBeVisible();
});
