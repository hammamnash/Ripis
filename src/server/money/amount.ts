import { Prisma } from '@prisma/client';

import { ApiError } from '../http/errors';

/**
 * Turning what a client sent into a `Decimal(19,4)` — and refusing to guess.
 *
 * Money is the one value this application may never hold as a JavaScript `number` (ADR-0012), so no
 * amount is ever parsed by `Number()` and then handed to Prisma. It arrives as a string and stays a
 * string until `Decimal` has it.
 *
 * Two refusals matter more than they look.
 *
 * - **More than four decimal places.** Postgres would silently round it, and the user who typed
 *   `1.00005` would be shown `1.0001` with nothing having said so. Rounding happens once, at display
 *   (ADR-0003), which means it never happens on the way in; a fifth decimal place is a client bug and
 *   is reported as one.
 * - **Anything `Decimal(19,4)` cannot hold.** Fifteen integer digits and four decimals is the column's
 *   whole range. Without this check the overflow arrives as a Postgres error and leaves the API as a
 *   `500`, which tells the caller nothing about what they sent.
 */
export const MONEY_SCALE = 4;

/** `Decimal(19,4)`: 15 integer digits, 4 decimals. */
const MAX_AMOUNT = new Prisma.Decimal('999999999999999.9999');

export function parseAmount(text: string, field: string): Prisma.Decimal {
  let amount: Prisma.Decimal;

  try {
    amount = new Prisma.Decimal(text);
  } catch {
    throw new ApiError('validation_failed', 400, `${field} must be a decimal number.`, field);
  }

  if (!amount.isFinite()) {
    throw new ApiError('validation_failed', 400, `${field} must be a finite number.`, field);
  }

  if (amount.decimalPlaces() > MONEY_SCALE) {
    throw new ApiError(
      'validation_failed',
      400,
      `${field} cannot have more than ${MONEY_SCALE} decimal places.`,
      field,
    );
  }

  if (amount.abs().greaterThan(MAX_AMOUNT)) {
    throw new ApiError('validation_failed', 400, `${field} is larger than this app can hold.`, field);
  }

  return amount;
}

/** An amount that must be strictly positive — a transaction of `0` moves nothing and is not an entry. */
export function parsePositiveAmount(text: string, field: string): Prisma.Decimal {
  const amount = parseAmount(text, field);

  if (amount.lessThanOrEqualTo(0)) {
    throw new ApiError('validation_failed', 400, `${field} must be greater than zero.`, field);
  }

  return amount;
}

/**
 * The wire form of a monetary value: a string with exactly four decimal places, never a `number`
 * (`02-context.md` §6.1). `toFixed` rather than `toString`, because `toString` drops trailing zeros and
 * `1250000` would then cross the boundary in a shape no DTO documents.
 */
export function money(value: Prisma.Decimal): string {
  return value.toFixed(MONEY_SCALE);
}
