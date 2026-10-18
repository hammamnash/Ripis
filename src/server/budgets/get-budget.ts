import { db } from '../db';
import { ApiError } from '../http/errors';
import { requireCategoryForType } from '../categories/get-category';
import { BUDGET_INCLUDE, type BudgetWithCategory } from './serialise';

/**
 * Reading one budget that must exist and must be the caller's.
 *
 * A 404 rather than a 403, for the reason `get-wallet.ts` and `get-category.ts` give: the scoping
 * extension has already narrowed this read to the caller's rows, so another account's budget is
 * indistinguishable from one that does not exist, and that is the point — a distinct status would confirm
 * that an id exists in somebody else's ledger (ADR-0020).
 */
export async function findBudget(id: string): Promise<BudgetWithCategory | null> {
  return db.budget.findFirst({ where: { id }, include: BUDGET_INCLUDE });
}

export async function requireBudget(id: string): Promise<BudgetWithCategory> {
  const budget = await findBudget(id);

  if (budget === null) {
    throw new ApiError('not_found', 404, 'No such budget.');
  }

  return budget;
}

/**
 * The category a budget may be planned against — expense, and not archived.
 *
 * The two refusals are `requireCategoryForType`'s, reused rather than restated, because they are one rule
 * about which categories are usable at all: a change to either belongs in that one file (ADR-0039). Only
 * the archived sentence differs, and it has to — it names the act it refused, and "cannot be used on a new
 * transaction" would be a lie told to somebody creating a budget.
 *
 * **Expense only** is the rule that has no column behind it. §10 sums Actual Spending from `expense` rows,
 * so a budget on an income category could never be spent against; its bar would read `0.00%` for the rest
 * of its life while looking like a working feature.
 *
 * **Archived is refused** for the same reason a new transaction is: a category the user has retired is one
 * no new spending can be filed under, so a budget planned against it could never move either. A category
 * archived *after* its budget was created is deliberately not re-checked on read — that budget stays,
 * because the spending it already measured really happened.
 */
export async function requireBudgetCategory(id: string) {
  return requireCategoryForType(id, 'expense', 'a budget');
}
