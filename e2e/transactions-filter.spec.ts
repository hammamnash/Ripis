import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const ALPHA = "Filter Alpha";
const BETA = "Filter Beta";
let walletId = "";
let catA = "";
let catB = "";
let month = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  const wallet = await prisma.wallet.create({ data: { user_id: user.id, name: "Filter Wallet", wallet_type: "cash", is_liability: false, currency_id: "E2E", opening_balance: "0", current_balance: "0" } });
  walletId = wallet.id;
  const category = async (name: string) => {
    const row = await prisma.category.create({ data: { user_id: user.id, name, type: "expense", color: "#D22129" } });
    return row.id;
  };
  catA = await category(ALPHA);
  catB = await category(BETA);
  const now = new Date();
  month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = [
    { category_id: catA, description: "Alpha entry" },
    { category_id: catB, description: "Beta entry" },
  ];
  for (const row of rows) {
    await prisma.transaction.create({ data: { user_id: user.id, wallet_id: walletId, transaction_type: "expense", occurred_on: new Date(`${month}-01T00:00:00.000Z`), amount: "10000.0000", base_amount: "10000.0000", currency_id: "E2E", base_currency_id: "E2E", ...row } });
  }
});

test.afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { wallet_id: walletId } });
  await prisma.wallet.delete({ where: { id: walletId } });
  await prisma.category.deleteMany({ where: { id: { in: [catA, catB] } } });
  await prisma.$disconnect();
});

test("a filter narrows the list to the rows it names", async ({ page }) => {
  await page.goto(`/transactions?month=${month}`);
  await expect(page.getByText("Alpha entry")).toBeVisible();
  await expect(page.getByText("Beta entry")).toBeVisible();

  await page.goto(`/transactions?month=${month}&category=${catA}`);
  await expect(page.getByText("Alpha entry")).toBeVisible();
  await expect(page.getByText("Beta entry")).toHaveCount(0);
});
