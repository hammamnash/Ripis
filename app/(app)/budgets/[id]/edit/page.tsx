import { notFound } from "next/navigation";
import { connection } from "next/server";

import { BudgetForm } from "@/components/budget-form";
import { DeleteBudget } from "@/components/delete-budget";
import { ShellHeader } from "@/components/shell/header";
import { updateBudgetAction } from "@/app/(app)/budgets/actions";
import { trimMoney, type CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { findBudget } from "@/src/server/budgets/get-budget";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { money } from "@/src/server/money/amount";
import { calendarDate } from "@/src/server/time/calendar-date";

/*
 * §7 screen 9, changing what a budget is worth (FR-10).
 *
 * **Only the amount is a control.** A budget is identified by `(category, month)` — its unique key — so
 * the category and the month are shown as facts here, and `updateBudget` refuses either if a client sends
 * one anyway. Moving a budget to another month is a delete and a create, and the delete below is how that
 * is done deliberately rather than by accident.
 *
 * The redirect after a write goes back to the month the *budget* names, not to today's: a correction to
 * last month that landed on this month's list would look like it had not saved.
 */
/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

export default async function EditBudgetPage({ params }: PageProps<"/budgets/[id]/edit">) {
  await connection();
  const { caller } = await requireScreenSession();
  const { id } = await params;

  const data = await runAsCaller(caller, async () => {
    const budget = await findBudget(id);
    if (budget === null) return null;

    const [user, currencies] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: caller.id }, select: { primary_currency_id: true } }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);

    return { budget, primaryCurrency: user.primary_currency_id, currencies };
  });

  if (data === null) notFound();

  const month = calendarDate(data.budget.month).slice(0, 7);

  const row = data.currencies.find((currency) => currency.code === data.primaryCurrency);
  const display: CurrencyDisplay = row
    ? { symbol: row.symbol, suffix: row.suffix, minorUnit: row.minor_unit }
    : { symbol: data.primaryCurrency, suffix: false, minorUnit: 2 };

  return (
    <>
      <ShellHeader title="Edit budget" variant="nested" backHref={`/budgets?month=${month}`} />
      <div className="flex flex-col gap-8 px-4 pb-28 pt-2 md:max-w-[720px] md:px-6 md:pb-16 md:pt-4">
        <BudgetForm
          mode="edit"
          month={month}
          currency={display}
          action={updateBudgetAction}
          initial={{
            id: data.budget.id,
            amount: trimMoney(money(data.budget.amount)) ?? "",
            categoryName: data.budget.category.name,
            categoryColor: data.budget.category.color,
          }}
        />
        <DeleteBudget id={data.budget.id} month={month} categoryName={data.budget.category.name} />
      </div>
    </>
  );
}
