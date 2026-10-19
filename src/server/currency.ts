import { currentCaller, type Caller } from './context';
import { db } from './db';
import { ApiError } from './http/errors';

/**
 * The caller's primary currency — the figure that decides what a total is denominated in (Task 7.0,
 * ADR-0043).
 *
 * `User` is not one of the models the scoping extension narrows — a caller is established *by* looking one
 * up — so this read names the id explicitly. An unfiltered `findFirst` returns whichever row the database
 * offers first: the administrator's account, with a different primary currency, and the report then sums
 * nothing and returns a period of zeroes. That is exactly how the mistake was caught the first time, in
 * `month-summary.ts`, by a spec that ran after another file had created a second account.
 *
 * **It lived in three places before this module.** `reports/filter.ts` exported `primaryCurrency()` for the
 * reports and the budget list, and the cashbook export and the cashbook import each carried a private
 * `primaryCurrencyOf(actor)` — and the copies had already drifted: the export threw a plain `Error` where
 * the import threw `ApiError('not_found', 404)`, so the same missing account was a 500 on one path and a
 * 404 on the other. Two shapes for one rule is the defect; one module is the fix.
 */
export async function primaryCurrencyOf(actor: Caller): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: actor.id },
    select: { primary_currency_id: true },
  });

  if (user === null) {
    throw new ApiError('not_found', 404, 'No such account.');
  }

  return user.primary_currency_id;
}

/**
 * The same read for a caller established by the request context rather than passed in — what a route
 * handler and every report module reach for.
 *
 * The `undefined` branch is unreachable through a route — `withCaller` establishes the context — and is
 * stated rather than asserted so this module's contract is "runs as somebody" rather than "assumes
 * somebody".
 */
export async function primaryCurrency(): Promise<string> {
  const caller = currentCaller();
  if (caller === undefined) {
    throw new ApiError('unauthenticated', 401, 'A report is read as an account.');
  }

  return primaryCurrencyOf(caller);
}
