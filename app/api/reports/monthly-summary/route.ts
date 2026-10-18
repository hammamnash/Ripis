import { withCaller } from '../../../../src/server/auth/require-user';
import { readReportQuery } from '../../../../src/server/reports/filter';
import { monthSummary } from '../../../../src/server/reports/month-summary';

/**
 * A period's income, expense and net (FR-11, Task 4.1).
 *
 * The route parses, delegates and serialises (ADR-0039): the window, the filters and the arithmetic all
 * live in `src/server/reports/**`, which is the same module the dashboard screen calls, so the two cannot
 * disagree about what a month is. `month=2026-10` or `from`/`to` say which days; `walletId`, `currencyId`,
 * `categoryId`, `categoryType` and `transactionType` narrow every figure in the reply (Task 4.4).
 *
 * Nothing here converts a `Decimal` for the wire. Every amount leaves as the string `money()` produced
 * (ADR-0012, ADR-0003) — a JSON number would have been through a float by the time a client read it.
 */
export const GET = withCaller(async (request) => {
  const query = new URL(request.url).searchParams;

  return Response.json({ data: await monthSummary(readReportQuery(query)) });
});
