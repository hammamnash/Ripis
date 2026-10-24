import { ChartPie } from "lucide-react";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { BudgetBar } from "@/components/budget-bar";
import { EmptyState } from "@/components/empty-state";
import { MonthSelector } from "@/components/month-selector";
import { ShellHeader } from "@/components/shell/header";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { listBudgets } from "@/src/server/budgets/list-budgets";
import { readBudgetMonth } from "@/src/server/budgets/month";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { calendarDate } from "@/src/server/time/calendar-date";

const SCALE = 4;

/** Money is summed in 1e-4 integer units, never in floating point: two `Number()`s agreeing to the
 *  nearest double is not the same as a total that is exact. */
function toScaled(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^[-+]/, "").split(".");
  const digits = `${whole}${(fraction + "0".repeat(SCALE)).slice(0, SCALE)}`.replace(/^0+(?=\d)/, "") || "0";
  const scaled = BigInt(digits);
  return negative ? -scaled : scaled;
}

function fromScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const text = absolute.toString().padStart(SCALE + 1, "0");
  return `${negative ? "-" : ""}${text.slice(0, -SCALE)}.${text.slice(-SCALE)}`;
}

/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  await connection();
  const { caller } = await requireScreenSession();

  const params = await searchParams;
  const month =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : calendarDate(new Date()).slice(0, 7);

  const data = await runAsCaller(caller, async () => {
    const [budgets, user, currencies] = await Promise.all([
      listBudgets(readBudgetMonth(new URLSearchParams({ month }))),
      db.user.findUniqueOrThrow({ where: { id: caller.id }, select: { primary_currency_id: true } }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);
    return { budgets, primaryCurrency: user.primary_currency_id, currencies };
  });

  /* A budget carries no currency of its own — it is a limit in the ledger's primary currency, which is
     permanent at account creation (ADR-0015). */
  const row = data.currencies.find((currency) => currency.code === data.primaryCurrency);
  const display: CurrencyDisplay = row
    ? { symbol: row.symbol, suffix: row.suffix, minorUnit: row.minor_unit }
    : { symbol: data.primaryCurrency, suffix: false, minorUnit: 2 };

  const budgeted = fromScaled(data.budgets.reduce((total, bar) => total + toScaled(bar.amount), 0n));
  const spent = fromScaled(data.budgets.reduce((total, bar) => total + toScaled(bar.used), 0n));

  return (
    <>
      <ShellHeader title="Budgets">
        <MonthSelector month={month} basePath="/budgets" />
      </ShellHeader>

      {data.budgets.length === 0 ? (
        <div className="px-4 py-10">
          <EmptyState icon={ChartPie} title="No budgets this month">
            Set a monthly limit per category to see how the month is tracking before it is over.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-6 px-4 py-4">
          <p data-testid="budget-summary" className="text-caption text-ash">
            <Amount value={spent} currency={display} direction="none" /> spent of{" "}
            <Amount value={budgeted} currency={display} /> budgeted
          </p>

          <div className="flex flex-col gap-5">
            {data.budgets.map((bar) => (
              <BudgetBar key={bar.id} bar={bar} currency={display} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
