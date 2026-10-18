import { ApiError } from '../http/errors';
import { calendarDate, firstOfMonth, monthWindow, parseCalendarDate } from '../time/calendar-date';

/**
 * The one month a budget is about (FR-10, §10, Task 5.1).
 *
 * A budget is keyed by `(user_id, category_id, month)`, and `month` is a **calendar month** stored as the
 * first day of it. This module is the only place that decides which day a written string names, so the
 * value in a request body, the value in a URL and the value in a route's path all land on the same column
 * value: `2026-10-15` and `2026-10` and `2026-10-01` are one budget, not three, and the unique index that
 * says so is never the thing that discovers it.
 *
 * **A month is required, never defaulted.** The API does not answer "what month is it?". A default would
 * have to pick a clock — the server's, or the account's `User.timezone` — and either choice is a silently
 * wrong answer for a caller who meant the other one. `User.timezone` exists in the schema and is used
 * nowhere; making it load-bearing here would be the first use, and it would be invisible. A screen that
 * knows which month it is showing has the value; one that does not is a screen that has not decided what
 * it is asking for.
 */
export interface BudgetMonth {
  /**
   * The first day of the month, as UTC midnight — the exact form `Budget.month` is stored in, so this is
   * the value a write sends and the value a read filters on.
   */
  from: Date;
  /**
   * **Exclusive**: the first day of the next month. Never a day a query names, and never a day that has
   * to exist — which is why the spending window is half-open (see `monthWindow`).
   */
  to: Date;
  /** `YYYY-MM-DD`, the wire form. */
  label: string;
}

/**
 * A month written by a caller, normalised.
 *
 * The 7-character shorthand is expanded rather than refused, matching the report filter's `month=`: a
 * person writing a month writes `2026-10`, and a day they added anyway is truncated to the month rather
 * than rejected — `2026-10-15` and `2026-10-01` are the same month to everybody except the unique index.
 * Refusing the long form would mean the same fact had two spellings that behave differently.
 */
export function parseBudgetMonth(text: string): BudgetMonth {
  const written = text.length === 7 ? `${text}-01` : text;
  const { from, to } = monthWindow(firstOfMonth(parseCalendarDate(written, 'month')));

  return { from, to, label: calendarDate(from) };
}

/** The month a read is about, from the query string. Required — see the note on this module. */
export function readBudgetMonth(params: URLSearchParams): BudgetMonth {
  const text = params.get('month');

  if (text === null || text === '') {
    throw new ApiError('validation_failed', 400, 'month is required.', 'month');
  }

  return parseBudgetMonth(text);
}
