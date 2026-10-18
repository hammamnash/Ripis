import { withCaller } from '../../../../src/server/auth/require-user';
import { readBudgetMonth } from '../../../../src/server/budgets/month';
import { budgetMonthStatus } from '../../../../src/server/budgets/month-status';

/**
 * The month's budgets as one figure, plus the alerts worth restating (§10, Task 5.3).
 *
 * A read, and only a read. There is no alert to create, acknowledge or dismiss, and no endpoint that would
 * need one: an alert is the status a Budget Bar already shows, recomputed when this is called
 * (ADR-0011, ADR-0018). Deleting the endpoint would lose nothing but the round trip.
 *
 * Static segment, so Next routes `/api/budgets/status` here rather than to `[id]` — the same reason
 * `/api/categories/[id]/archive` exists as its own directory.
 */
export const GET = withCaller(async (request) => {
  const month = readBudgetMonth(new URL(request.url).searchParams);

  return Response.json(await budgetMonthStatus(month));
});
