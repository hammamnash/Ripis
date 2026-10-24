import { connection } from "next/server";

import { BudgetForm } from "@/components/budget-form";
import { ShellHeader } from "@/components/shell/header";
import { createBudgetAction } from "@/app/(app)/budgets/actions";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { listBudgets } from "@/src/server/budgets/list-budgets";
import { parseBudgetMonth } from "@/src/server/budgets/month";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { calendarDate } from "@/src/server/time/calendar-date";

/*
 * §7 screen 9's input half (FR-10) — the route the budgets screen has been missing since it shipped
 * read-only.
 *
 * The month is a search param for the same reason it is on the list: it is what the screen is *about*, so
 * the budget created here belongs to the month the user was looking at, and a reload reproduces it.
 *
 * The category picker offers only **expense** categories with no budget yet this month. That is not a
 * second copy of the server's rule — `createBudget` still refuses a duplicate with §6.1's 409 naming the
 * category — it is the screen declining to offer a choice that cannot succeed. Somebody who wants to
 * change a budget that already exists wants the *edit* screen, which is where a bar leads.
 */
/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

export default async function NewBudgetPage({ searchParams }: PageProps<"/budgets/new">) {
  await connection();
  const { caller } = await requireScreenSession();

  const params = await searchParams;
  const month =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : calendarDate(new Date()).slice(0, 7);

  const data = await runAsCaller(caller, async () => {
    const [budgets, categories, user, currencies] = await Promise.all([
      listBudgets(parseBudgetMonth(month)),
      db.category.findMany({
        where: { type: "expense", archived_at: null },
        select: { id: true, name: true, color: true },
        orderBy: [{ name: "asc" }],
      }),
      db.user.findUniqueOrThrow({ where: { id: caller.id }, select: { primary_currency_id: true } }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);

    return { budgets, categories, primaryCurrency: user.primary_currency_id, currencies };
  });

  const taken = new Set(data.budgets.map((budget) => budget.categoryId));

  /* A budget carries no currency of its own — it is a limit in the ledger's primary currency, which is
     permanent at account creation (ADR-0015), so the mark is displayed and never chosen. */
  const row = data.currencies.find((currency) => currency.code === data.primaryCurrency);
  const display: CurrencyDisplay = row
    ? { symbol: row.symbol, suffix: row.suffix, minorUnit: row.minor_unit }
    : { symbol: data.primaryCurrency, suffix: false, minorUnit: 2 };

  return (
    <>
      <ShellHeader title="New budget" variant="nested" backHref={`/budgets?month=${month}`} />
      <div className="flex flex-col gap-8 px-4 pb-28 pt-2 md:max-w-[720px] md:px-6 md:pb-16 md:pt-4">
        <BudgetForm
          mode="create"
          month={month}
          currency={display}
          action={createBudgetAction}
          categories={data.categories.filter((category) => !taken.has(category.id))}
        />
      </div>
    </>
  );
}
