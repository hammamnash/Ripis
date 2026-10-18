import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { money, parsePositiveAmount } from '../money/amount';
import { calendarDate } from '../time/calendar-date';
import { requireBudgetCategory } from './get-budget';
import { parseBudgetMonth } from './month';
import { BUDGET_INCLUDE, serialiseBudget, type BudgetResponse } from './serialise';

/**
 * A budget for one category, for one month (FR-10, §10, Task 5.1).
 *
 * **The amount is in the primary currency.** A budget is a single figure, so it cannot be stored
 * per-currency: `Budget.amount` is money in the account's own currency, and Actual Spending is measured
 * against it in that currency by summing the frozen `base_amount` (ADR-0004). That works without a
 * conversion at read time precisely because `User.primary_currency_id` is permanent (ADR-0015) — the
 * currency every transaction froze its `base_amount` in is the same one a budget is written in, always.
 *
 * **Any month is allowed, including a past one.** A budget for next month is the ordinary case; a budget
 * for last month is a correction, and it is permitted because the alternative — refusing it — strands a
 * typo with no repair path, since a budget has no soft delete to undo. What makes editing the past safe is
 * not a date check but the audit row: no budget write moves a balance, and every one of them is
 * answerable afterwards (§14, FR-14).
 *
 * **`amount` must be positive.** `parsePositiveAmount` rather than `parseAmount`, because the table
 * carries `CHECK (amount > 0)` and a `0` budget is not merely pointless: it is the denominator of the
 * percentage, so it would make every status computed from it a confident answer derived from nothing.
 * Refusing it here means the constraint is never the thing that reports it, and the caller gets a 400
 * naming the field instead of a 500 carrying Postgres' text.
 */
export interface NewBudget {
  actor: Caller;
  categoryId: string;
  amount: string;
  month: string;
}

export async function createBudget(input: NewBudget): Promise<BudgetResponse> {
  const month = parseBudgetMonth(input.month);
  const amount = parsePositiveAmount(input.amount, 'amount');
  const category = await requireBudgetCategory(input.categoryId);

  // Checked here so the refusal is §6.1's 409 naming the field, rather than the unique index's violation
  // arriving as a 500. The index is still what actually guarantees it — two concurrent creates can both
  // pass this check — so this is the message, and `@@unique([user_id, category_id, month])` is the rule.
  const existing = await db.budget.findFirst({
    where: { category_id: category.id, month: month.from },
  });

  if (existing !== null) {
    throw new ApiError(
      'budget_already_exists',
      409,
      `A budget for ${category.name} already exists for ${month.label.slice(0, 7)}.`,
      'categoryId',
    );
  }

  return writeAudited({
    actor: input.actor,
    entityType: 'budget',
    action: 'created',
    run: async (tx) => {
      const budget = await tx.budget.create({
        data: {
          user_id: input.actor.id,
          category_id: category.id,
          amount,
          month: month.from,
        },
        include: BUDGET_INCLUDE,
      });

      return {
        written: budget,
        entityId: budget.id,
        after: {
          category_id: budget.category_id,
          amount: money(budget.amount),
          month: calendarDate(budget.month),
        },
      };
    },
  }).then(serialiseBudget);
}
