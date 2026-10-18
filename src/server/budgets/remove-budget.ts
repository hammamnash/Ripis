import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { money } from '../money/amount';
import { calendarDate } from '../time/calendar-date';
import { requireBudget } from './get-budget';

/**
 * Removing a budget (FR-10, §10, Task 5.1).
 *
 * **A hard delete**, and the only hard delete in this application. Money-changing rows are soft-deleted so
 * that a sum can never silently lose a row it should have counted (ADR-0005), but a budget changes no
 * balance — it is a limit, not an entry — so there is nothing for a tombstone to protect. What it does
 * leave behind is a unique key: a soft-deleted budget would keep occupying
 * `(user_id, category_id, month)`, so the category could never be budgeted for that month again, and the
 * user's only repair would be renaming the category. §10 decides it as a hard delete, and the surviving
 * record is the audit row.
 *
 * Deleting is also the supported way to *move* a budget: `PATCH` refuses to change the month, because a
 * budget's category and month are its identity (see `update-budget.ts`), so the caller who meant "not
 * this month" deletes and creates. That is two audit rows telling the truth about two acts.
 */
export async function deleteBudget(input: { actor: Caller; id: string }): Promise<{ status: 'ok' }> {
  const before = await requireBudget(input.id);

  await writeAudited({
    actor: input.actor,
    entityType: 'budget',
    action: 'deleted',
    before: {
      category_id: before.category_id,
      amount: money(before.amount),
      month: calendarDate(before.month),
    },
    run: async (tx) => {
      const budget = await tx.budget.delete({ where: { id: input.id } });

      // `after: null` rather than an omitted field: the row is gone, so there is no state to record, and
      // the row's absence is the fact. `writeAudited` stores an absent value as an absent column, which is
      // the same thing a reader would infer — but stating it here is what makes this deliberate.
      return { written: budget, entityId: budget.id, after: null };
    },
  });

  // `{status: 'ok'}` rather than the deleted row, matching `deleteWallet`: a deletion removes the thing
  // from its own representation, and returning it invites a client to keep rendering it.
  return { status: 'ok' };
}
