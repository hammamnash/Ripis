import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const CATEGORY = "Verification Budget Category";
const CREATED = "Verification Budget Input Category";
let categoryId = "";
let createdCategoryId = "";
let month = "";

/*
 * Find-or-create, so a run that failed midway does not poison the next one with a unique-name collision.
 * The budgets those categories carry are removed first below — the specs assert counts, so they start from a
 * known state rather than from whatever the last run left in this month.
 */
async function category(userId: string, name: string, color: string) {
  const existing = await prisma.category.findFirst({ where: { user_id: userId, name } });
  if (existing !== null) return existing;

  return prisma.category.create({ data: { user_id: userId, name, type: "expense", color } });
}

test.beforeAll(async () => {
  const now = new Date();
  month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-spec@ripis.test" } });

  const seeded = await category(user.id, CATEGORY, "#D22129");
  const created = await category(user.id, CREATED, "#7D8C22");
  categoryId = seeded.id;
  createdCategoryId = created.id;

  await prisma.budget.deleteMany({ where: { category_id: { in: [categoryId, createdCategoryId] } } });
  await prisma.budget.create({
    data: {
      user_id: user.id,
      category_id: categoryId,
      month: new Date(`${month}-01T00:00:00.000Z`),
      amount: "2000000.0000",
    },
  });
});

test.afterAll(async () => {
  await prisma.budget.deleteMany({ where: { category_id: { in: [categoryId, createdCategoryId] } } });
  await prisma.category.deleteMany({ where: { id: { in: [categoryId, createdCategoryId] } } });
  await prisma.$disconnect();
});

test("a budget renders as a bar carrying its limit", async ({ page }) => {
  await page.goto(`/budgets?month=${month}`);
  await expect(page.getByText(CATEGORY)).toBeVisible();
  await expect(page.getByTestId("budget-summary")).toBeVisible();
  await expect(page.locator('[data-slot="budget-bar"]')).toHaveCount(1);
});

/*
 * The screen the feature was missing (§7 screen 9's input half). A seeded row proves a bar *renders*; only
 * this proves a person can make one — and that the delete really frees the category for that month again,
 * which is the whole reason `deleteBudget` is a hard delete rather than a tombstone.
 */
test("a budget is created, changed and deleted through the screens", async ({ page }) => {
  await page.goto(`/budgets/new?month=${month}`);
  await expect(page.getByTestId("budget-form-month")).toContainText("For");
  await page.getByLabel("Category").selectOption({ label: CREATED });
  await page.getByLabel("Monthly limit").fill("1500000");
  await page.getByRole("button", { name: "Save budget" }).click();

  await page.waitForURL(`/budgets?month=${month}`);
  const bar = page.getByTestId("budget-bar-link").filter({ hasText: CREATED });
  await expect(bar).toBeVisible();

  await bar.click();
  await expect(page.getByLabel("Monthly limit")).toHaveValue("1500000");
  await page.getByLabel("Monthly limit").fill("1750000");
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.waitForURL(`/budgets?month=${month}`);
  await page.getByTestId("budget-bar-link").filter({ hasText: CREATED }).click();
  await expect(page.getByLabel("Monthly limit")).toHaveValue("1750000");

  /* Two buttons carry this name — the trigger and the confirmation's own submit — so the confirmation is
     asked for inside the dialog. */
  await page.getByRole("button", { name: "Delete budget" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete budget" }).click();

  await page.waitForURL(`/budgets?month=${month}`);
  /* Counted by test id, not by text: the router keeps the tree of a segment you have already visited mounted,
     so a text query also finds the category name in the edit screen and in the picker it was chosen from. */
  await expect(page.getByTestId("budget-bar-link").filter({ hasText: CREATED })).toHaveCount(0);
  /* The seeded budget is still there — only the one this test made is gone. */
  await expect(page.getByTestId("budget-bar-link")).toHaveCount(1);

  /* The unique key `(user_id, category_id, month)` is free again: the category is offered once more. */
  await page.goto(`/budgets/new?month=${month}`);
  await expect(page.getByRole("option", { name: CREATED })).toHaveCount(1);
});

