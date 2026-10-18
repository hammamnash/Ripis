import { Prisma } from '@prisma/client';

import { db } from '../db';
import { money } from '../money/amount';
import type { BudgetMonth } from './month';
import { serialiseBudget, type BudgetResponse, type BudgetWithCategory } from './serialise';
import { budgetStanding, type BudgetStanding } from './status';

/**
 * What was actually spent, and what that means for each budget (FR-10, §10, Task 5.2).
 *
 * **Usage is measured on `base_amount`, not `amount`.** `base_amount` is frozen at the value a
 * foreign-currency purchase had on the day it happened (ADR-0004), so a budget set in the primary currency
 * counts a euro purchase at the rate that applied when it was made — not at today's rate. Summing `amount`
 * instead would compare euros to rupiah and mix every currency in the ledger into one number.
 *
 * **Only `expense` rows count.** A budget is a spending limit, and a transfer or an exchange moves money
 * between the user's own wallets without spending any of it, so counting one would inflate a budget by the
 * act of moving money around. This needs no special case: the database guarantees every expense carries a
 * category and no other type has to, so a category-keyed sum of expenses is exactly Actual Spending.
 */

export interface BudgetBarResponse extends BudgetResponse, BudgetStanding {
  /** The month's spending in this category, in the primary currency. */
  used: string;
  /**
   * `amount − used`, **signed rather than clamped at zero**.
   *
   * Over budget it is negative, and that is the honest sentence: `0` would read as "nothing left", when
   * what happened is that the limit was passed by a known amount. The bar renders the sign, and the label
   * already says which side of the line it is on.
   */
  remaining: string;
}

const ZERO = new Prisma.Decimal(0);

/**
 * The month's spending per category, in one query for the whole month.
 *
 * A per-budget query would ask the same question once per bar — five budgets, five round trips, and the
 * answers could even disagree. This reads the month once and hands back a lookup.
 *
 * `deleted_at: null` is **stated here** and not inherited from anywhere (ADR-0005). `reportWhere` leaves it
 * out on purpose so that every caller has to write it and so that a forgotten one is visible in review; a
 * budget that counted soft-deleted rows would report money the user had removed and its bar would sit
 * further along than the transactions behind it.
 */
export async function spendByCategory(
  month: BudgetMonth,
  currency: string,
): Promise<Map<string, Prisma.Decimal>> {
  const rows = await db.transaction.groupBy({
    by: ['category_id'],
    where: {
      deleted_at: null,
      occurred_on: { gte: month.from, lt: month.to },
      base_currency_id: currency,
      transaction_type: 'expense',
      // A budget is keyed by a category, so a row with no category has nothing to attach to. The CHECK
      // constraint makes this unreachable; it is here so the lookup below cannot be handed a null key.
      category_id: { not: null },
    },
    _sum: { base_amount: true },
  });

  const spend = new Map<string, Prisma.Decimal>();

  for (const row of rows) {
    if (row.category_id === null) continue;

    spend.set(row.category_id, row._sum.base_amount ?? ZERO);
  }

  return spend;
}

/**
 * The budgets as bars: the stored row, plus what the month's spending makes of it.
 *
 * A category with no expense rows this month is absent from `spend` rather than present as zero, so it is
 * defaulted here — a budget nobody has spent against is `0.00%` and green, which is a different thing from
 * a budget that does not exist.
 */
export function budgetBars(
  budgets: BudgetWithCategory[],
  spend: Map<string, Prisma.Decimal>,
): BudgetBarResponse[] {
  return budgets.map((budget) => {
    const used = spend.get(budget.category_id) ?? ZERO;

    return {
      ...serialiseBudget(budget),
      ...budgetStanding(used, budget.amount),
      used: money(used),
      remaining: money(budget.amount.minus(used)),
    };
  });
}
