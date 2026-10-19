import { Prisma, type TxType } from '@prisma/client';

import { db } from '../db';
import { money } from '../money/amount';
import { addDays, calendarDate } from '../time/calendar-date';
import { primaryCurrency } from '../currency';
import { parseReportFilter, reportWhere, wholeMonthOf, type ReportQuery } from './filter';

/**
 * A period's income, expense and net (FR-11, Task 3.9).
 *
 * **It reads `occurred_on` and nothing else.** `recorded_at` is a timestamp and is audit only, so a
 * transaction entered in November about an October purchase belongs to October — and this query cannot
 * accidentally include the November one, because the two columns are different types and only one of them
 * is filtered here (ADR-0007).
 *
 * **The window is half-open** — `[from, to)` — rather than a `BETWEEN` with a last day in it, because
 * every month's last day is a different number and `2026-02-30` is exactly the string a generated
 * inclusive bound produces. It comes from `filter.ts` now, so that the summary, the breakdowns and the
 * trends narrow over the same days (Task 4.4) — three modules deriving a month's bounds separately is
 * three chances to disagree about which day October ends on.
 *
 * **Transfers and exchanges are absent from both totals by construction, not by a filter.** The query sums
 * rows whose type is `income` or `expense`, so a transfer has nowhere to land: it is neither, and summing
 * it as either would double-count — the money left one wallet and arrived in another, and a month's income
 * is not the sum of its internal movements. There is no "exclude transfers" clause to get wrong.
 *
 * Totals are in the **frozen base currency** (ADR-0004), so a month already reported does not change when a
 * rate moves. The caller's primary currency is read by `primaryCurrency()`, which names the row it means
 * for the reason stated there.
 */
const COUNTED: TxType[] = ['income', 'expense'];

export interface MonthSummary {
  /** The first day counted, inclusive. */
  from: string;
  /** The last day counted, inclusive — the window is half-open internally and widened back for the wire. */
  to: string;
  /**
   * `2026-10-01` when the window is exactly one calendar month, otherwise `null`. A screen labels its
   * period from this rather than from two bounds it would have to do date arithmetic on.
   */
  month: string | null;
  currency: string;
  income: string;
  expense: string;
  net: string;
  counts: { income: number; expense: number };
}

/**
 * `month` is any calendar date in the month being summarised — `"2026-10-01"`, or `"2026-10"` read as its
 * first day; a range is `from` and `to` instead. Taking a date rather than a year-and-month pair keeps one
 * parsing rule for the whole application, and it is `parseReportFilter` that applies it.
 */
export async function monthSummary(query: ReportQuery): Promise<MonthSummary> {
  const filter = parseReportFilter(query);
  const currency = await primaryCurrency();

  const rows = await db.transaction.groupBy({
    by: ['transaction_type'],
    where: {
      ...reportWhere(filter, filter, currency),
      // Stated in the module that sums rather than inherited from the filter builder, because the
      // soft-delete filter has to be visible in the file the query lives in (ADR-0005): a total that
      // forgets it is inflated and entirely plausible.
      deleted_at: null,
      // A filter that names a type narrows this to it — filtering to transfers is a report of two zeroes,
      // which is what "only transfers" means for income and expense. Without one, the two counted types.
      transaction_type: filter.transactionType ?? { in: COUNTED },
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
    from: calendarDate(filter.from),
    to: calendarDate(addDays(filter.to, -1)),
    month: wholeMonthOf(filter),
    currency,
    income: money(income),
    expense: money(expense),
    net: money(income.minus(expense)),
    counts: { income: countOf('income'), expense: countOf('expense') },
  };
}
