import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { money, parseAmount } from '../money/amount';
import { serialiseWallet, type WalletResponse } from './serialise';
import { resolveLiability, requireWalletType } from './wallet-type';

/**
 * A new wallet (FR-08).
 *
 * `current_balance` starts at `opening_balance` and is not a parameter: a wallet that has just been
 * created has no transactions, so anything else the client sent would be a balance with nothing behind
 * it. It is stated rather than left to a database default so the row is complete the moment it exists.
 *
 * The balance is then rebuilt from the row's own transactions by `recomputeBalance` (Task 3.4) — which
 * for a new wallet must return exactly `opening_balance`. That equality is asserted in the spec, and it
 * is the cheapest place to catch a recompute that reads the wrong column.
 *
 * The audit payload uses the model's field names rather than the wire's camelCase (§14 rows from Phase 2
 * use the model names, and one table with two spellings of the same field is how a reader stops trusting
 * either). Money is written as a string there too — a `Decimal` in a `Json` column would be serialised by
 * whatever handles it next, and that is exactly the conversion ADR-0012 forbids.
 */
export interface NewWallet {
  actor: Caller;
  name: string;
  walletType: string;
  currencyId: string;
  openingBalance: string;
  isLiability?: boolean;
  institution?: string | null;
  notes?: string | null;
}

export async function createWallet(input: NewWallet): Promise<WalletResponse> {
  const wallet_type = requireWalletType(input.walletType);
  const is_liability = resolveLiability(wallet_type, input.isLiability);
  const opening_balance = parseAmount(input.openingBalance, 'openingBalance');

  const currency = await db.currency.findUnique({ where: { code: input.currencyId } });
  if (currency === null) {
    throw new ApiError('validation_failed', 400, 'That is not a currency this app knows.', 'currencyId');
  }

  return writeAudited({
    actor: input.actor,
    entityType: 'wallet',
    action: 'created',
    run: async (tx) => {
      const wallet = await tx.wallet.create({
        data: {
          // Stated rather than left to the scoping extension: the extension injects the owner at
          // runtime, but the *type* of a create still requires it, and a wallet written without an
          // explicit owner is exactly the row ADR-0020 forbids.
          user_id: input.actor.id,
          name: input.name,
          wallet_type,
          is_liability,
          currency_id: input.currencyId,
          opening_balance,
          current_balance: opening_balance,
          institution: input.institution ?? null,
          notes: input.notes ?? null,
        },
      });

      return {
        written: wallet,
        entityId: wallet.id,
        after: {
          name: wallet.name,
          wallet_type: wallet.wallet_type,
          is_liability: wallet.is_liability,
          currency_id: wallet.currency_id,
          opening_balance: money(wallet.opening_balance),
          current_balance: money(wallet.current_balance),
        },
      };
    },
  }).then(serialiseWallet);
}
