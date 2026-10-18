import { Prisma, type TxType } from '@prisma/client';

import { db } from '../db';
import { ApiError } from '../http/errors';
import { money } from '../money/amount';
import { changeBetween, type Change } from '../money/change';
import { addDays, calendarDate, firstOfMonth } from '../time/calendar-date';
import {
  oneOf,
  parseReportFilter,
  previousWindow,
  primaryCurrency,
  readReportQuery,
  reportWhere,
  type Granularity,
  type ReportQuery,
} from './filter';

export const METRICS = ['expense', 'cash-flow'] as const;
export type TrendMetric = (typeof METRICS)[number];

const COUNTED: readonly TxType[] = ['income', 'expense'];

export interface TrendPoint {
  /** `2026-10-03` for a day, `2026-10-01` for a month — the first day of the bucket, always a full date. */
  period: string;
  income: string;
  expense: string;
  net: string;
}
interface Figures {
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
  counts: { income: number; expense: number };
}

/** A trend query is a report query plus the one word that says which line is being plotted. */
export interface TrendQuery extends ReportQuery {
  metric?: string;
}

export function readTrendQuery(params: URLSearchParams): TrendQuery {
  return { ...readReportQuery(params), metric: params.get('metric') ?? undefined };
}

export interface TrendReport {
  metric: TrendMetric;
  currency: string;
  /** The first day counted, inclusive. */
  from: string;
  /** The last day counted, inclusive. */
  to: string;
  granularity: Granularity;
  /** Every period in the window, in order, **including the ones with no rows** (zeros, not gaps). */
  points: TrendPoint[];
  totals: { income: string; expense: string; net: string; counts: { income: number; expense: number } };
  /** The plotted figure against the same figure for the period of the same length before this one. */
  comparison: Change & { metric: 'expense' | 'net' };
}

/**
 * A series over the window, and the one comparison the whole window makes (Task 4.3, §8).
 *
 * Two metrics share one shape rather than one shape each, because they are the same query read two ways:
 * `expense` plots the expense line of a period, `cash-flow` plots what the period did to the user's money
 * (`net`). Both replies carry all three figures per point, so a screen showing cash flow does not have to
 * ask again for the income it is drawing beside the expense — and `comparison.metric` names which figure
 * the direction is about, because "up" means nothing on its own.
 *
 * **Points are generated from the window, not from the data.** A day with no transactions is a zero in the
 * series, not a missing one: a line chart drawn from the rows alone would connect 1 October to 20 October
 * and imply three weeks of steady spending. That is also why `periodsBetween` walks calendar days rather
 * than deriving them from the reply's rows.
 *
 * A transfer is in no figure here. It moves money between the user's own wallets, so it changes neither the
 * income line, nor the expense line, nor `net` — the query counts the two types that have a direction, and
 * there is no "exclude transfers" clause to get wrong (ADR-0008).
 */
export async function trends(query: TrendQuery): Promise<TrendReport> {
  const filter = parseReportFilter(query);
  const metric = readTrendMetric(query.metric);
  const currency = await primaryCurrency();
  const previous = previousWindow(filter);

  const [grouped, earlier] = await Promise.all([
    db.transaction.groupBy({
      by: ['occurred_on', 'transaction_type'],
      where: {
        // In the module that sums, on purpose: the soft-delete filter has to be visible in the file the
        // query lives in (ADR-0005), so it is stated here rather than left to the filter builder.
        ...reportWhere(filter, filter, currency),
        deleted_at: null,
        // The caller's own type filter wins where there is one — narrowing a trend to transfers gives a
        // series of zeroes, which is what a trend of internal movement is.
        transaction_type: filter.transactionType ?? { in: [...COUNTED] },
      },
      _sum: { base_amount: true },
      _count: { _all: true },
    }),
    db.transaction.groupBy({
      by: ['transaction_type'],
      where: {
        ...reportWhere(filter, previous, currency),
        deleted_at: null,
        transaction_type: filter.transactionType ?? { in: [...COUNTED] },
      },
      _sum: { base_amount: true },
    }),
  ]);

  const buckets = new Map<string, Figures>();
  for (const period of periodsBetween(filter.from, filter.to, filter.granularity)) {
    buckets.set(period, { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0), counts: { income: 0, expense: 0 } });
  }

  for (const row of grouped) {
    const bucket = buckets.get(periodOf(row.occurred_on, filter.granularity));
    // Unreachable — the query filters the same window the periods came from — and skipped rather than
    // folded into a neighbour, which would put a figure in a month it does not belong to (ADR-0007).
    if (bucket === undefined) continue;

    add(bucket, row.transaction_type, row._sum.base_amount ?? new Prisma.Decimal(0), row._count._all);
  }

  const points = [...buckets.entries()].map(([period, figures]) => ({
    period,
    income: money(figures.income),
    expense: money(figures.expense),
    net: money(figures.income.minus(figures.expense)),
  }));

  const totals = [...buckets.values()].reduce<Figures>(
    (sum, figures) => {
      sum.income = sum.income.plus(figures.income);
      sum.expense = sum.expense.plus(figures.expense);
      sum.counts.income += figures.counts.income;
      sum.counts.expense += figures.counts.expense;

      return sum;
    },
    { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0), counts: { income: 0, expense: 0 } },
  );

  const previousTotals = earlier.reduce<{ expense: Prisma.Decimal; net: Prisma.Decimal }>(
    (sum, row) => {
      const summed = row._sum.base_amount ?? new Prisma.Decimal(0);
      if (row.transaction_type === 'expense') sum.expense = sum.expense.plus(summed);
      if (row.transaction_type === 'income') sum.net = sum.net.plus(summed);

      return sum;
    },
    { expense: new Prisma.Decimal(0), net: new Prisma.Decimal(0) },
  );

  const plotted = metric === 'expense' ? 'expense' : 'net';
  const current = plotted === 'expense' ? totals.expense : totals.income.minus(totals.expense);
  const before = plotted === 'expense' ? previousTotals.expense : previousTotals.net.minus(previousTotals.expense);

  return {
    metric,
    currency,
    from: calendarDate(filter.from),
    to: calendarDate(addDays(filter.to, -1)),
    granularity: filter.granularity,
    points,
    totals: {
      income: money(totals.income),
      expense: money(totals.expense),
      net: money(totals.income.minus(totals.expense)),
      counts: totals.counts,
    },
    comparison: { metric: plotted, ...changeBetween(current, before) },
  };
}

/** The metric a trend plots, read off the query and refused by name when it is neither. */
export function readTrendMetric(text: string | undefined): TrendMetric {
  if (text === undefined || text === '') {
    throw new ApiError('validation_failed', 400, 'metric is required.', 'metric');
  }

  return oneOf(text, METRICS, 'metric');
}

/**
 * Every period the window contains, in order. A month is bucketed by day and a longer window by month —
 * decided once in `filter.ts`, where a caller who asks for days over a quarter is refused with the reason.
 */
export function periodsBetween(from: Date, to: Date, granularity: Granularity): string[] {
  const periods: string[] = [];
  const next = (date: Date): Date =>
    granularity === 'day'
      ? addDays(date, 1)
      : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

  for (let date = granularity === 'day' ? from : firstOfMonth(from); date.getTime() < to.getTime(); date = next(date)) {
    periods.push(periodOf(date, granularity));
  }

  return periods;
}

/** Which bucket a date belongs to. Both forms are full calendar dates, so a client never parses a month name. */
function periodOf(date: Date, granularity: Granularity): string {
  return calendarDate(granularity === 'day' ? date : firstOfMonth(date));
}

function add(bucket: Figures, type: TxType, sum: Prisma.Decimal, count: number): void {
  if (type === 'income') {
    bucket.income = bucket.income.plus(sum);
    bucket.counts.income += count;

    return;
  }

  bucket.expense = bucket.expense.plus(sum);
  bucket.counts.expense += count;
}
