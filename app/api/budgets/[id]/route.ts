import { withCaller } from '../../../../src/server/auth/require-user';
import { deleteBudget } from '../../../../src/server/budgets/remove-budget';
import { updateBudget } from '../../../../src/server/budgets/update-budget';
import { readJsonObject } from '../../../../src/server/http/request';

/**
 * Editing and removing one budget (FR-10, §10, Task 5.1).
 *
 * The parsed body goes straight to `updateBudget`, which owns the rule about which fields a budget edit
 * may name: `amount` only. `categoryId` and `month` are the budget's identity, so changing either is a
 * different budget — delete this one and create that one (ADR-0039).
 *
 * `DELETE` is a hard delete, and the reason it is safe is in `remove-budget.ts`: a budget moves no
 * balance, so there is no history for a tombstone to protect and a soft-deleted row would only keep the
 * category unbudgetable for that month.
 */
export const PATCH = withCaller<{ params: Promise<{ id: string }> }>(
  async (request, { caller }, context) => {
    const { id } = await context.params;
    const body = await readJsonObject(request);

    return Response.json(await updateBudget({ actor: caller, id, body }));
  },
);

export const DELETE = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, { caller }, context) => {
    const { id } = await context.params;

    return Response.json(await deleteBudget({ actor: caller, id }));
  },
);
