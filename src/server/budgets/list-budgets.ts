import { db } from '../db';
import type { BudgetMonth } from './month';
import { BUDGET_INCLUDE, serialiseBudget, type BudgetResponse } from './serialise';

/**
 * Every budget set for one month (FR-10, §10, Task 5.1).
 *
 * One month at a time, and no filter beyond it. A budget list is not a report: §10's dashboard is the
 * budgets *for the month you are looking at*, so there is no wallet, currency or category narrowing here —
 * those belong to §8's reporting surface, which reads transactions rather than limits.
 *
 * **Ordered by the category name a person reads**, because §10's dashboard is a list of categories that is
 * scanned rather than ordered by value, and the categories themselves are listed this way. `id` breaks
 * ties so two budgets cannot swap places between renders of the same month — a row that moves on its own
 * reads as a change that did not happen.
 */
export async function listBudgets(month: BudgetMonth): Promise<BudgetResponse[]> {
  const budgets = await db.budget.findMany({
    where: { month: month.from },
    include: BUDGET_INCLUDE,
    orderBy: [{ category: { name: 'asc' } }, { id: 'asc' }],
  });

  return budgets.map(serialiseBudget);
}
