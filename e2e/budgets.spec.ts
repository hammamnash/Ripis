import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const CATEGORY = "Verification Budget Category";
let categoryId = "";
let month = "";

test.beforeAll(async () => {
  const now = new Date();
  month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });
  const category = await prisma.category.create({
    data: { user_id: user.id, name: CATEGORY, type: "expense", color: "#D22129" },
  });
  categoryId = category.id;
  await prisma.budget.create({
    data: {
      user_id: user.id,
      category_id: category.id,
      month: new Date(`${month}-01T00:00:00.000Z`),
      amount: "2000000.0000",
    },
  });
});

test.afterAll(async () => {
  await prisma.budget.deleteMany({ where: { category_id: categoryId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});

test("a budget renders as a bar carrying its limit", async ({ page }) => {
  await page.goto(`/budgets?month=${month}`);
  await expect(page.getByText(CATEGORY)).toBeVisible();
  await expect(page.getByTestId("budget-summary")).toBeVisible();
  await expect(page.locator('[data-slot="budget-bar"]')).toHaveCount(1);
});
