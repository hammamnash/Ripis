import type { CategoryType, Prisma, TxType } from '@prisma/client';

import { currentCaller } from '../context';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { addDays, calendarDate, firstOfMonth, monthWindow, parseCalendarDate } from '../time/calendar-date';

/**
 * The one filter object every report is computed from (Task 4.4, §8).
 *
 * A dashboard rarely fails by adding up wrongly. It fails by adding up correctly over the *wrong rows*:
 * a filtered list beside unfiltered totals, so every figure on the screen is right on its own and the
 * page still does not add up. The fix is structural rather than careful — one object, every figure
 * derived from it, and no screen building its own `where` clause, so there is no second place for the
 * filters to drift apart.
 *
 * Two rules are worth stating before the code, because they are the ones a later reader breaks:
 *
 * **The window is half-open** — `[from, to)` — for the reason `monthWindow` gives: an inclusive upper
 * bound has to name a day that exists, and `2026-11-31` is exactly the string that gets written when
 * somebody adds a month instead of stepping to the next one. A range off a screen names its last day
 * *inclusively* ("to 31 October"), so it is widened by a day in here, once, and never again downstream.
 *
 * **`deleted_at` is deliberately not part of `reportWhere`.** The soft-delete filter is stated by the
 * module that runs the query, because `test/ledger-invariants.spec.ts` reads the file a `groupBy` lives
 * in and a filter one import away is a filter that check cannot see (ADR-0005). `reportWhere` narrows;
 * the caller excludes.
 */
export const GRANULARITIES = ['day', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

const TYPES: readonly TxType[] = ['expense', 'income', 'transfer', 'exchange'];
const CATEGORY_TYPES: readonly CategoryType[] = ['income', 'expense'];

/**
 * How many days a window may span before a day-by-day series is refused. A month is read a day at a time
 * and a quarter is the most a chart on this screen carries; a year of days is 365 points, which is a
 * client mistake this layer can name rather than serve.
 */
export const MAX_DAILY_DAYS = 92;

/** And the span under which days are the *default*: six weeks of days still reads, a quarter does not. */
const DEFAULT_DAILY_DAYS = 45;

/** What a route has read off the URL. Every field is a string, because a query parameter is one. */
export interface ReportQuery {
  month?: string;
  from?: string;
  to?: string;
  granularity?: string;
  walletId?: string;
  currencyId?: string;
  categoryId?: string;
  categoryType?: string;
  transactionType?: string;
}

export interface Window {
  /** Inclusive: the first day counted. */
  from: Date;
  /** **Exclusive**: the day after the last day counted, and never a day a report names. */
  to: Date;
}

export interface ReportFilter extends Window {
  granularity: Granularity;
  walletId?: string;
  currencyId?: string;
  categoryId?: string;
  categoryType?: CategoryType;
  transactionType?: TxType;
}

/** Reads the names this layer expects off a query string. Absent and empty are the same thing here. */
export function readReportQuery(params: URLSearchParams): ReportQuery {
  const text = (name: string): string | undefined => params.get(name) ?? undefined;

  return {
    month: text('month'),
    from: text('from'),
    to: text('to'),
    granularity: text('granularity'),
    walletId: text('walletId'),
    currencyId: text('currencyId'),
    categoryId: text('categoryId'),
    categoryType: text('categoryType'),
    transactionType: text('transactionType'),
  };
}

/**
 * A query to a window and the narrowings on it, or a refusal that names the field.
 *
 * A month and a range together are refused rather than silently resolved: whichever won, the other is a
 * client bug, and a report that quietly ignores half of what it was asked for is worse than a 400.
 */
export function parseReportFilter(query: ReportQuery): ReportFilter {
  const window = parseWindow(query);

  return {
    ...window,
    granularity: parseGranularity(query.granularity, window),
    ...parseNarrowings(query),
  };
}

/**
 * The window of the same length immediately before this one, which is what every "vs last period"
 * figure is computed over.
 *
 * Length is measured in days rather than by shifting the month, so that a range and a month behave the
 * same way here: October's previous window is September because 1 October minus 31 days is 1 September,
 * and 1–15 October's is 16–30 September, not "the same half of September".
 */
export function previousWindow(window: Window): Window {
  const days = daysIn(window);

  return { from: addDays(window.from, -days), to: window.from };
}

/**
 * `2026-10-01` when the window is exactly one calendar month, and `null` otherwise — so a screen can
 * label a report "October 2026" without doing date arithmetic on two bounds, and cannot mislabel a range
 * that merely starts on the first. A custom range that happens to cover October is still October.
 */
export function wholeMonthOf(window: Window): string | null {
  const { from, to } = monthWindow(window.from);

  return from.getTime() === window.from.getTime() && to.getTime() === window.to.getTime()
    ? calendarDate(firstOfMonth(window.from))
    : null;
}

/**
 * The `where` every report narrows with: the window, the frozen base currency, and whichever filters the
 * caller set. Anything not set is absent rather than defaulted, so "all types" is expressed by the query
 * that needs all types and not by a filter that happens to mean it.
 */
export function reportWhere(
  filter: ReportFilter,
  window: Window,
  baseCurrencyId: string,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    occurred_on: { gte: window.from, lt: window.to },
    // A report is denominated in one currency, and `base_amount` is the only figure the ledger froze in
    // it. Rows frozen in another base currency cannot be added to these totals (ADR-0004, ADR-0015).
    base_currency_id: baseCurrencyId,
  };

  // A wallet filter means "money that touched this wallet", so both legs are named: matching `wallet_id`
  // alone would hide the destination side of a transfer and quietly shrink the period.
  if (filter.walletId !== undefined) {
    where.OR = [{ wallet_id: filter.walletId }, { destination_wallet_id: filter.walletId }];
  }

  if (filter.currencyId !== undefined) {
    where.currency_id = filter.currencyId;
  }

  if (filter.categoryId !== undefined) {
    where.category_id = filter.categoryId;
  }

  // Through the relation rather than a list of ids resolved first: a category's type is the caller's
  // data, and a client that sends a type this account does not use gets an empty report, not an error.
  // Rows with no category — transfers and exchanges — fall out of any result narrowed this way, which is
  // what "only expenses" means.
  if (filter.categoryType !== undefined) {
    where.category = { type: filter.categoryType };
  }

  if (filter.transactionType !== undefined) {
    where.transaction_type = filter.transactionType;
  }

  return where;
}

/**
 * The caller's primary currency, read from their own row.
 *
 * `User` is not one of the models the scoping extension narrows (ADR-0043 — a caller is established *by*
 * looking one up), so this read names the id explicitly. An unfiltered `findFirst` returns whichever row
 * the database offers first — the administrator's account, with a different primary currency — and the
 * report then sums nothing and returns a period of zeroes. That is exactly how the mistake was caught the
 * first time, in `month-summary.ts`, by a spec that ran after another file had created a second account.
 */
export async function primaryCurrency(): Promise<string> {
  const caller = currentCaller();
  if (caller === undefined) {
    // Unreachable through a route — `withCaller` establishes the context — and stated rather than
    // asserted so the module's contract is "runs as somebody" rather than "assumes somebody".
    throw new ApiError('unauthenticated', 401, 'A report is read as an account.');
  }

  const user = await db.user.findUnique({
    where: { id: caller.id },
    select: { primary_currency_id: true },
  });
  if (user === null) {
    throw new ApiError('not_found', 404, 'No such account.');
  }

  return user.primary_currency_id;
}

function parseWindow(query: ReportQuery): Window {
  const hasRange = query.from !== undefined || query.to !== undefined;

  if (query.month !== undefined && hasRange) {
    throw new ApiError('validation_failed', 400, 'Give a month or a range, not both.', 'month');
  }

  if (query.month !== undefined) {
    // `2026-10` is read as its first day, the same shorthand the rest of the application uses, so one
    // parsing rule covers a month written short and a month written long.
    const month = query.month.length === 7 ? `${query.month}-01` : query.month;

    return monthWindow(parseCalendarDate(month, 'month'));
  }

  if (hasRange) {
    if (query.from === undefined) {
      throw new ApiError('validation_failed', 400, 'A range needs from as well as to.', 'from');
    }
    if (query.to === undefined) {
      throw new ApiError('validation_failed', 400, 'A range needs to as well as from.', 'to');
    }

    const from = parseCalendarDate(query.from, 'from');
    const to = parseCalendarDate(query.to, 'to');

    if (to.getTime() < from.getTime()) {
      throw new ApiError('validation_failed', 400, 'to is before from.', 'to');
    }

    return { from, to: addDays(to, 1) };
  }

  throw new ApiError('validation_failed', 400, 'A report needs a month, or a from and a to.', 'month');
}

function parseGranularity(text: string | undefined, window: Window): Granularity {
  const days = daysIn(window);

  if (text === undefined || text === '') {
    // The caller's own window is the best evidence of how they mean to look at it: a month is read a day
    // at a time, and asking for a quarter means monthly points.
    return days <= DEFAULT_DAILY_DAYS ? 'day' : 'month';
  }

  const granularity = oneOf(text, GRANULARITIES, 'granularity');
  if (granularity === 'day' && days > MAX_DAILY_DAYS) {
    throw new ApiError(
      'validation_failed',
      400,
      `A day-by-day series covers at most ${MAX_DAILY_DAYS} days; read this window by month.`,
      'granularity',
    );
  }

  return granularity;
}

function parseNarrowings(query: ReportQuery): Partial<ReportFilter> {
  const narrowings: Partial<ReportFilter> = {};

  const set = (name: keyof ReportQuery): string | undefined => {
    const value = query[name];

    return value === undefined || value === '' ? undefined : value;
  };

  const walletId = set('walletId');
  if (walletId !== undefined) narrowings.walletId = walletId;

  const currencyId = set('currencyId');
  if (currencyId !== undefined) narrowings.currencyId = currencyId;

  const categoryId = set('categoryId');
  if (categoryId !== undefined) narrowings.categoryId = categoryId;

  const categoryType = set('categoryType');
  if (categoryType !== undefined) narrowings.categoryType = oneOf(categoryType, CATEGORY_TYPES, 'categoryType');

  const transactionType = set('transactionType');
  if (transactionType !== undefined) {
    narrowings.transactionType = oneOf(transactionType, TYPES, 'transactionType');
  }

  return narrowings;
}

function daysIn(window: Window): number {
  return Math.round((window.to.getTime() - window.from.getTime()) / 86_400_000);
}

function oneOf<T extends string>(text: string, allowed: readonly T[], field: string): T {
  const value = allowed.find((candidate) => candidate === text);
  if (value === undefined) {
    throw new ApiError('validation_failed', 400, `${field} must be one of ${allowed.join(', ')}.`, field);
  }

  return value;
}
