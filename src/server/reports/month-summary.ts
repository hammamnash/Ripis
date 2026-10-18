import { Prisma, type TxType } from '@prisma/client';

import { currentCaller } from '../context';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { money } from '../money/amount';
import { firstOfMonth, monthWindow, parseCalendarDate } from '../time/calendar-date';

/**
 * A month's income, expense and net (FR-11, Task 3.9).
 *
 * **It reads `occurred_on` and nothing else.** `recorded_at` is a timestamp and is audit only, so a
 * transaction entered in November about an October purchase belongs to October — and this query cannot
 * accidentally include the November one, because the two columns are different types and only one of them
 * is filtered here (ADR-0007).
 *
 * **The window is half-open** — `[first of the month, first of the next month)` — rather than a `BETWEEN`
 * with a last day in it, because every month's last day is a different number and `2026-02-30` is exactly
 * the string a generated inclusive bound produces.
 *
 * **Transfers and exchanges are absent from both totals by construction, not by a filter.** The query sums
 * rows whose type is `income` or `expense`, so a transfer has nowhere to land: it is neither, and summing
 * it as either would double-count — the money left one wallet and arrived in another, and a month's income
 * is not the sum of its internal movements. There is no "exclude transfers" clause to get wrong.
 *
 * Totals are in the **frozen base currency** (ADR-0004), so a month already reported does not change when a
 * rate moves.
 *
 * **The currency is read from the caller's own row, named explicitly.** `User` is not one of the models the
 * scoping extension narrows (ADR-0043 — a caller is established *by* looking one up), so an unfiltered
 * `findFirst` here returns whichever row the database offers first. That is the administrator's account,
 * with a different primary currency, and the query then sums nothing and reports a month of zeroes — which
 * is exactly how this line was caught, by a spec that ran after another file had created a second account.
 */
const COUNTED: TxType[] = ['income', 'expense'];

export interface MonthSummary {
  month: string;
  currency: string;
  income: string;
  expense: string;
  net: string;
  counts: { income: number; expense: number };
}

/**
 * `month` is any calendar date in the month being summarised — `"2026-10-01"`, or `"2026-10"` read as its
 * first day. Taking a date rather than a year-and-month pair keeps one parsing rule for the whole app.
 */
export async function monthSummary(month: string): Promise<MonthSummary> {
  const anchor = parseCalendarDate(month.length === 7 ? `${month}-01` : month, 'month');
  const { from, to } = monthWindow(anchor);

  const caller = currentCaller();
  if (caller === undefined) {
    // Unreachable through a route — `withCaller` establishes the context — and stated rather than asserted
    // so the module's contract is "runs as somebody" rather than "assumes somebody".
    throw new ApiError('unauthenticated', 401, 'A month summary is read as an account.');
  }

  const user = await db.user.findUnique({
    where: { id: caller.id },
    select: { primary_currency_id: true },
  });
  if (user === null) {
    throw new ApiError('not_found', 404, 'No such account.');
  }

  const rows = await db.transaction.groupBy({
    by: ['transaction_type'],
    where: {
      deleted_at: null,
      transaction_type: { in: COUNTED },
      occurred_on: { gte: from, lt: to },
      base_currency_id: user.primary_currency_id,
    },
    _sum: { base_amount: true },
    _count: { _all: true },
  });

  const sumOf = (type: TxType): Prisma.Decimal =>
    rows.find((row) => row.transaction_type === type)?._sum.base_amount ?? new Prisma.Decimal(0);
  const countOf = (type: TxType): number =>
    rows.find((row) => row.transaction_type === type)?._count._all ?? 0;

  const income = sumOf('income');
  const expense = sumOf('expense');

  return {
    month: firstOfMonth(anchor).toISOString().slice(0, 10),
    currency: user.primary_currency_id,
    income: money(income),
    expense: money(expense),
    net: money(income.minus(expense)),
    counts: { income: countOf('income'), expense: countOf('expense') },
  };
}
