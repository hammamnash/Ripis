import { Prisma } from '@prisma/client';

import { db } from '../db';
import { primaryCurrency } from '../reports/filter';
import type { BudgetMonth } from './month';
import { BUDGET_INCLUDE, type BudgetWithCategory } from './serialise';
import { budgetBars, spendByCategory, type BudgetBarResponse } from './usage';

/**
 * One month's budgets and spending, read once (FR-10, §10, Tasks 5.1–5.3).
 *
 * Both callers need the same two reads and only differ in what they do with them: `listBudgets` renders
 * bars, and `budgetMonthStatus` totals them. Returning the raw pair is what lets the totals be summed from
 * `Prisma.Decimal`s rather than from the strings `money()` just produced — re-parsing a formatted figure
 * would be exact but would also make the string the source of truth for arithmetic.
 */
export interface MonthBudgets {
  currency: string;
  budgets: BudgetWithCategory[];
  spend: Map<string, Prisma.Decimal>;
}

/**
 * **Ordered by the category name a person reads**, because §10's dashboard is a list of categories that is
 * scanned rather than ordered by value, and the categories themselves are listed this way. `id` breaks
 * ties so two budgets cannot swap places between renders of the same month — a row that moves on its own
 * reads as a change that did not happen.
 */
export async function readMonthBudgets(month: BudgetMonth): Promise<MonthBudgets> {
  // `primaryCurrency` is the reports layer's read of `User.primary_currency_id`, and it is reused rather
  // than rewritten: it names the row it means, which is the whole point of it (ADR-0043 — `User` is not one
  // of the models the scoping extension narrows, so an unfiltered read returns whoever the database offers
  // first). A second copy of that read would be a second chance to forget it.
  const currency = await primaryCurrency();

  const budgets = await db.budget.findMany({
    where: { month: month.from },
    include: BUDGET_INCLUDE,
    orderBy: [{ category: { name: 'asc' } }, { id: 'asc' }],
  });

  return { currency, budgets, spend: await spendByCategory(month, currency) };
}

/**
 * Every budget set for one month, with what the month has done to it (FR-10, §10, Tasks 5.1–5.2).
 *
 * One month at a time, and no filter beyond it. A budget list is not a report: §10's dashboard is the
 * budgets *for the month you are looking at*, so there is no wallet, currency or category narrowing here —
 * those belong to §8's reporting surface, which reads transactions rather than limits.
 *
 * **Usage is folded into the same array rather than served beside it.** A screen showing a bar and a total
 * for that bar must not be able to obtain them from two sources that could disagree; that failure — a list
 * narrowed by a filter next to a figure that was not — is the one Task 4.4 exists to prevent. Here it is
 * prevented structurally: there is one array, and the bar's own figure is in it.
 */
export async function listBudgets(month: BudgetMonth): Promise<BudgetBarResponse[]> {
  const { budgets, spend } = await readMonthBudgets(month);

  return budgetBars(budgets, spend);
}
