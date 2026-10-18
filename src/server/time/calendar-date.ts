import { ApiError } from '../http/errors';

/**
 * `occurred_on` is a **calendar date**, and this module is the only place the application decides what
 * day a written string names (ADR-0007).
 *
 * The rule the whole reporting layer rests on: a transaction that happened at 23:30 on 31 October in
 * Jakarta belongs to **October**, and it belongs to October no matter which timezone the server runs
 * in or which one the reader is sitting in. Storing a timestamp cannot deliver that — `2026-10-31
 * 16:30Z` is November in Jakarta — so the column is Postgres `date` and the value that reaches it is
 * built here, as UTC midnight of the day the user named rather than of the instant we were told.
 *
 * `recorded_at` is a timestamp and is audit only. No report reads it; ADR-0007's whole point is that
 * they cannot, because the two are different types.
 */

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` string to the `Date` a `@db.Date` column stores: UTC midnight of that day.
 *
 * The round trips matter. `new Date('2026-10-31')` is already UTC midnight, but
 * `new Date('2026-10-31T00:00:00')` is local midnight and lands on 30 October once it reaches a UTC
 * column in a negative-offset timezone. So the parts are read explicitly and fed to `Date.UTC`, and a
 * date that does not exist — `2026-02-30` — is refused rather than rolled forward into March.
 */
export function parseCalendarDate(text: string, field: string): Date {
  if (!CALENDAR_DATE.test(text)) {
    throw new ApiError('validation_failed', 400, `${field} must be a date written as YYYY-MM-DD.`, field);
  }

  // Read by offset rather than by splitting and indexing: the pattern above already guarantees the
  // three parts are digits, and an indexed read would be `string | undefined` under this project's
  // settings — which would push an assertion into the one function that exists to avoid guessing.
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  // A day that does not exist rolls over into the next month, so the parts are compared back.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ApiError('validation_failed', 400, `${field} is not a real date.`, field);
  }

  return date;
}

/** The wire form: `YYYY-MM-DD`, the day the stored date names, with no time and no offset. */
export function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The first day of the month a calendar date falls in, as UTC midnight — the form `Budget.month` is
 * stored in, and the lower bound of a month query.
 */
export function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * The half-open window a month query filters on: `[first day, first day of the next month)`. Half-open
 * rather than `BETWEEN`, because an inclusive upper bound has to name a day that exists and every
 * month's last day is a different one — `2026-02-30` is exactly the string that would get written.
 */
export function monthWindow(month: Date): { from: Date; to: Date } {
  const from = firstOfMonth(month);

  return { from, to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)) };
}
