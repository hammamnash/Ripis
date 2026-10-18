import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { ApiError } from '../http/errors';
import { readOptionalString } from '../http/request';
import { money, parsePositiveAmount } from '../money/amount';
import { calendarDate } from '../time/calendar-date';
import { requireBudget } from './get-budget';
import { BUDGET_INCLUDE, serialiseBudget, type BudgetResponse } from './serialise';

/**
 * Changing what a budget is worth (FR-10, §10, Task 5.1).
 *
 * **`amount` is the only field an edit may name.** `categoryId` and `month` are refused rather than
 * ignored, because together they *are* the budget's identity — they are the unique key. "Change the month
 * of this budget to November" is not an edit to this budget; it is a different budget that happens to
 * share its amount, and performing it by moving the row would leave a `PATCH` and a `DELETE`+`POST` that
 * mean the same thing while writing different audit rows. The refusal says so and names the alternative.
 *
 * An unknown field is refused too, for the reason `rejectUnknownFields` gives: a client that sent `name`
 * believes it renamed something, and a `200` that renamed nothing is a believable success.
 */
const IMMUTABLE = new Set(['categoryId', 'month']);

const MUTABLE = new Set(['amount']);

export interface BudgetEdit {
  actor: Caller;
  id: string;
  body: Record<string, unknown>;
}

export async function updateBudget(edit: BudgetEdit): Promise<BudgetResponse> {
  for (const field of Object.keys(edit.body)) {
    if (IMMUTABLE.has(field)) {
      throw new ApiError(
        'immutable_field',
        400,
        `A budget's ${field} cannot be changed. This budget is identified by the category and month it names — delete it and create the one you meant.`,
        field,
      );
    }

    if (!MUTABLE.has(field)) {
      throw new ApiError('validation_failed', 400, `${field} is not a budget field.`, field);
    }
  }

  const before = await requireBudget(edit.id);
  const amount = readOptionalString(edit.body, 'amount');

  if (amount === undefined) {
    throw new ApiError('validation_failed', 400, 'Nothing to change. "amount" is the only field a budget edit may name.');
  }

  if (amount === null) {
    throw new ApiError('validation_failed', 400, 'amount cannot be cleared.', 'amount');
  }

  const parsed = parsePositiveAmount(amount, 'amount');

  return writeAudited({
    actor: edit.actor,
    entityType: 'budget',
    action: 'updated',
    before: {
      category_id: before.category_id,
      amount: money(before.amount),
      month: calendarDate(before.month),
    },
    run: async (tx) => {
      const budget = await tx.budget.update({
        where: { id: edit.id },
        data: { amount: parsed },
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
