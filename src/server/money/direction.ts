import { Prisma } from '@prisma/client';

/**
 * Direction, in one place (ADR-0025, I8).
 *
 * A liability balance is stored **positive** — a credit card holding 2,000,000 of debt reads
 * `2000000`, matching the statement the user is checking it against. Direction is therefore carried
 * by `is_liability`, never by the sign of `balance`, and this module is where that translation
 * happens once: `value = is_liability ? -balance : +balance`.
 *
 * Two questions live here because they are the same question asked twice.
 *
 * - **`value`** is the *state* question. Every net-worth total is a sum of `value` and nothing else,
 *   so it is the only place the sign of a liability is applied — which makes "the sign was applied
 *   twice" a failure mode that does not exist.
 * - **`balanceDelta`** is the *movement* question. An `Expense` on a credit card *increases* its
 *   balance; the reconciliation pair that is an `expense` on an asset wallet is an `income` on a
 *   card. The stored column and the net-worth figure move in opposite directions for a liability,
 *   and this is the only place that is encoded.
 */

/** A wallet, as much of it as direction needs. The model's own spelling, not the wire's. */
export interface WalletLike {
  is_liability: boolean;
}

/** The role a money movement plays, independent of which kind of wallet it lands on. */
export type MovementRole = 'expense' | 'income' | 'out' | 'in';

/**
 * What a wallet is worth in net worth: assets add, liabilities subtract.
 *
 * Never an absolute value — a card in credit (a negative stored balance) has a *positive* `value`,
 * which is money the user actually has. Reading this as `-Math.abs(balance)` is the same bug as
 * storing liabilities negative, arrived at from the other side.
 */
export function value(wallet: WalletLike, balance: Prisma.Decimal): Prisma.Decimal {
  return wallet.is_liability ? balance.negated() : balance;
}

/**
 * Which way a wallet moves, in value space: `expense` and `out` always decrease it, `income` and
 * `in` always increase it. The half that never looks at the wallet type.
 */
export function valueDelta(role: MovementRole, amount: Prisma.Decimal): Prisma.Decimal {
  switch (role) {
    case 'expense':
    case 'out':
      return amount.negated();
    case 'income':
    case 'in':
      return amount;
  }
}

/**
 * Which way the **stored `balance`** moves. On an asset wallet this is `valueDelta` unchanged; on a
 * liability it is the opposite, because the debt the number measures grows when money is spent.
 *
 * Anything that adjusts a `current_balance` goes through this, so one formula serves both kinds of
 * wallet and no caller has to remember which way round a credit card is.
 */
export function balanceDelta(
  wallet: WalletLike,
  role: MovementRole,
  amount: Prisma.Decimal,
): Prisma.Decimal {
  const delta = valueDelta(role, amount);

  return wallet.is_liability ? delta.negated() : delta;
}
