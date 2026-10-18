import type { Budget, Category, Prisma } from '@prisma/client';

import { money } from '../money/amount';
import { calendarDate } from '../time/calendar-date';

/**
 * The budget in its wire shape, mapped here and nowhere else (`02-context.md` §6.1).
 *
 * `month` crosses as `YYYY-MM-DD` — the first day of the month — rather than as a month name or a
 * year/month pair. It is the shape `occurred_on` crosses in, so a client parses one date format for the
 * whole API, and `Budget.month` is stored as the first of the month precisely so that what is read back
 * is what was written.
 *
 * There is no `deletedAt`, because there is no `deleted_at` column on this table (Task 1.5 asserts it):
 * deleting a budget is a **hard delete** whose surviving record is the audit row (§10). A client that
 * wants to know a budget once existed reads the audit log, not a tombstone — the alternative would leave
 * a soft-deleted budget still occupying the unique key `(user_id, category_id, month)` and so making the
 * category unbudgetable for that month forever.
 */
export interface BudgetResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: string;
  month: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The relation every budget read loads.
 *
 * `categoryName` and `categoryColor` are on the wire because a budget is *rendered* as its category —
 * §10's dashboard shows "Groceries", not a uuid — so a client that had to fetch the category list to draw
 * one bar would have two sources for one screen. The colour is sent rather than resolved client-side
 * because it is the user's own choice (ADR-0030); a palette lookup would overwrite it.
 *
 * `satisfies` rather than a type annotation: the literal `true`s have to survive for Prisma to infer the
 * selected fields, and an annotation would widen them to plain `boolean` and infer an empty object.
 */
export const BUDGET_INCLUDE = {
  category: { select: { name: true, color: true } },
} satisfies Prisma.BudgetInclude;

/** The row as every budget module loads it: the budget, plus the two category fields the wire needs. */
export type BudgetWithCategory = Budget & {
  category: Pick<Category, 'name' | 'color'>;
};

export function serialiseBudget(budget: BudgetWithCategory): BudgetResponse {
  return {
    id: budget.id,
    categoryId: budget.category_id,
    categoryName: budget.category.name,
    categoryColor: budget.category.color,
    amount: money(budget.amount),
    month: calendarDate(budget.month),
    createdAt: budget.created_at.toISOString(),
    updatedAt: budget.updated_at.toISOString(),
  };
}
