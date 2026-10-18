import { Prisma } from '@prisma/client';

import { money } from '../money/amount';
import { calendarDate } from '../time/calendar-date';
import { readMonthBudgets } from './list-budgets';
import type { BudgetMonth } from './month';
import { BUDGET_ALERT_THRESHOLD, budgetStanding, isAlert, type BudgetStatus } from './status';
import { budgetBars, type BudgetBarResponse } from './usage';

/**
 * The month's budgets as one figure, and the bars worth restating (§10, Task 5.3).
 *
 * **Alerts are a filter of the bars, not a second computation.** §10 is explicit that an alert *is* the
 * status the Budget Bar already shows, restated at the top of the screen — so it is the same array, with
 * the green ones removed, and a screen renders an alert with the component it already has. Recomputing the
 * statuses here would be two chances to disagree about one bar, which is the defect this shape makes
 * impossible. That is also why nothing fires while the app is closed: there is no alert state anywhere,
 * only a question answered when it is asked (ADR-0011, ADR-0018).
 *
 * **The aggregate is a sum, not a verdict.** `totalUsed / totalBudget` answers "how much of the money I
 * planned have I spent" — and it can be green while a single category is red, because overspending one
 * budget and underspending another nets out. That is not a flaw to fix by taking the worst status: the two
 * figures answer different questions, and the one that would hide an overspend is the aggregate. Which is
 * exactly why `alerts` is carried alongside rather than derived from the month's own colour.
 */
export interface BudgetMonthStatus {
  month: string;
  /** The currency every figure here is in: the account's own, which is permanent (ADR-0015). */
  currency: string;
  /** How many budgets the month has, so a screen can say "4 budgets" without counting the array itself. */
  budgets: number;
  totalBudget: string;
  totalUsed: string;
  /** `totalBudget − totalUsed`, signed, for the reason a single bar's is (see `usage.ts`). */
  totalRemaining: string;
  percent: string | null;
  status: BudgetStatus | null;
  label: string | null;
  token: string | null;
  /** Where a bar becomes an alert, so the client is not the one that knows the number. */
  threshold: number;
  alerts: BudgetBarResponse[];
}

const ZERO = new Prisma.Decimal(0);

export async function budgetMonthStatus(month: BudgetMonth): Promise<BudgetMonthStatus> {
  const { currency, budgets, spend } = await readMonthBudgets(month);
  const bars = budgetBars(budgets, spend);

  // Summed from the stored `Decimal`s, not from the strings the bars carry.
  const totalBudget = budgets.reduce((sum, budget) => sum.plus(budget.amount), ZERO);
  const totalUsed = budgets.reduce(
    (sum, budget) => sum.plus(spend.get(budget.category_id) ?? ZERO),
    ZERO,
  );

  // A month with no budgets has no percentage to be at — not `0%`, which would read as "nothing spent
  // against nothing planned" and is the same thing a month at 0 of a real budget says. `null` keeps the
  // two apart, and `budgetStanding` refuses a zero denominator rather than inventing an answer for it.
  const overall = totalBudget.greaterThan(0) ? budgetStanding(totalUsed, totalBudget) : null;

  return {
    month: calendarDate(month.from),
    currency,
    budgets: budgets.length,
    totalBudget: money(totalBudget),
    totalUsed: money(totalUsed),
    totalRemaining: money(totalBudget.minus(totalUsed)),
    percent: overall?.percent ?? null,
    status: overall?.status ?? null,
    label: overall?.label ?? null,
    token: overall?.token ?? null,
    threshold: BUDGET_ALERT_THRESHOLD,
    alerts: bars.filter(isAlert),
  };
}
