import { withCaller } from '../../../src/server/auth/require-user';
import { createBudget } from '../../../src/server/budgets/create-budget';
import { listBudgets } from '../../../src/server/budgets/list-budgets';
import { readBudgetMonth } from '../../../src/server/budgets/month';
import { readJsonObject, readString, rejectUnknownFields } from '../../../src/server/http/request';

/**
 * Budgets (FR-10, §10, Task 5.1).
 *
 * Parse, delegate, serialise (ADR-0039). Every rule this endpoint obeys — the month is normalised to the
 * first of it, the category must be an unarchived expense category, the amount must be positive, one
 * budget per category per month — lives in `src/server/budgets/**` and is stated nowhere here.
 *
 * `month` is required on the read rather than defaulted to "now" — see `budgets/month.ts` for why the API
 * does not answer that question.
 */
export const GET = withCaller(async (request) => {
  const month = readBudgetMonth(new URL(request.url).searchParams);

  return Response.json({ data: await listBudgets(month) });
});

export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, ['categoryId', 'amount', 'month']);

  const created = await createBudget({
    actor: caller,
    categoryId: readString(body, 'categoryId'),
    amount: readString(body, 'amount'),
    month: readString(body, 'month'),
  });

  return Response.json(created, { status: 201 });
});
