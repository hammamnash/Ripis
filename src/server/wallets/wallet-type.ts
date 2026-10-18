import type { WalletType } from '@prisma/client';

import { ApiError } from '../http/errors';

/**
 * `is_liability` pre-fills from `wallet_type`, and this table is the whole of that rule (ADR-0025).
 *
 * It exists as data rather than as a `switch` inside the create path for one reason: ADR-0025 says the
 * flag is **required** and that the belt-and-braces case is real. Two of these eleven types do not
 * imply an answer — an investment account can hold margin debt, and "other" means the user has thought
 * about it and we have not — so `null` here means *the client must answer*, and a create that leaves it
 * out is refused rather than defaulted. A second copy of this table is how `other` quietly acquires a
 * default and a brokerage account silently stops counting against net worth.
 *
 * The flag is **not** re-derived from this table when `wallet_type` is later edited (ADR-0025): a user
 * who corrected their credit card to an asset has said something the app must not undo by guessing.
 */
export const LIABILITY_PREFILL: Record<WalletType, boolean | null> = {
  cash: false,
  debit_account: false,
  savings_account: false,
  checking_account: false,
  prepaid_card: false,
  e_wallet: false,
  credit_card: true,
  loan: true,
  debt: true,
  investment_account: null,
  other: null,
};

const WALLET_TYPES = Object.keys(LIABILITY_PREFILL) as WalletType[];

export function isWalletType(value: string): value is WalletType {
  return (WALLET_TYPES as string[]).includes(value);
}

/**
 * The type a request named, or a 400 that names the field.
 *
 * Returning the narrowed `WalletType` rather than a boolean is what keeps `createWallet` from casting:
 * a caller that checks the validation and then asserts the type anyway has two places that know the
 * enum, and the assertion is the one that stops being true first.
 */
export function requireWalletType(value: string): WalletType {
  if (!isWalletType(value)) {
    throw new ApiError('validation_failed', 400, 'That is not a wallet type this app knows.', 'walletType');
  }

  return value;
}

/** A wallet type whose liability answer the client has to state, because the type does not imply one. */
export function liabilityAnswerRequired(type: WalletType): boolean {
  return LIABILITY_PREFILL[type] === null;
}

/**
 * Resolves the flag a create should store, or refuses.
 *
 * A body that **contradicts** its type's pre-fill is rejected rather than corrected. Silently flipping
 * the flag would move the wallet between the two halves of `assets − liabilities` without the person
 * who sent the request ever being told, and the whole reason the flag is required is that this choice
 * is the user's.
 *
 * An unknown type is a `validation_failed` with the field named — the enum lives in the database, so
 * letting Postgres refuse it would render as a `500` about a driver value.
 */
export function resolveLiability(type: WalletType, stated: boolean | undefined): boolean {
  const prefill = LIABILITY_PREFILL[type];

  if (prefill === null) {
    if (stated === undefined) {
      throw new ApiError(
        'wallet_type_requires_liability_answer',
        400,
        `A ${type.replace(/_/g, ' ')} can be either, so isLiability is required.`,
        'isLiability',
      );
    }

    return stated;
  }

  if (stated !== undefined && stated !== prefill) {
    throw new ApiError(
      'liability_contradicts_wallet_type',
      400,
      `A ${type.replace(/_/g, ' ')} is ${prefill ? 'a liability' : 'not a liability'}.`,
      'isLiability',
    );
  }

  return prefill;
}
