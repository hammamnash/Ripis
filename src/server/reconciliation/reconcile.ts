import type { Caller } from '../context';
import { ApiError } from '../http/errors';
import { parseAmount } from '../money/amount';
import { value } from '../money/direction';
import { createTransaction } from '../transactions/create-transaction';
import type { TransactionResponse } from '../transactions/serialise';
import { recomputeBalance } from '../wallets/balance';
import { requireWallet } from '../wallets/get-wallet';

/**
 * Reconciling a wallet against its statement (FR-09, Task 3.10).
 *
 * A reconciliation is **not** a fifth transaction type (ADR-0017). It is an ordinary `income` or `expense`
 * row noted `Balance Difference`, which means it counts toward the month's totals like anything else and
 * its note is its only marker. Two consequences follow, and both are deliberate: there is no
 * "exclude reconciliations" filter anywhere, and the row is editable and deletable because it is a row.
 *
 * The direction is **derived, never chosen**. On an asset, closing a gap upwards is `income` and downwards
 * is `expense`; on a liability the same two arithmetic facts are the *opposite* types, because a card's
 * balance rises when the user spends. That inversion is the whole reason this module computes the type
 * from `value` space instead of taking it as a parameter — a caller who could name the type could file a
 * correction that moves the stored balance away from the figure they just entered, and the row would look
 * exactly like a correct one afterwards.
 *
 * A wallet whose figure already matches is refused rather than written as a zero row: the caller has
 * stated the number the ledger already holds, and a `Balance Difference` of nothing is a row that inflates
 * the month's activity count while changing no money at all.
 */
export interface Reconciliation {
  actor: Caller;
  walletId: string;
  /** The figure on the statement, stated the way the statement states it: a card's debt is positive. */
  actualBalance: string;
  occurredOn: string;
  categoryId: string;
}

export interface ReconciliationResult {
  direction: 'income' | 'expense';
  differenceValue: string;
  transaction: TransactionResponse;
}

export async function reconcile(input: Reconciliation): Promise<ReconciliationResult> {
  const wallet = await requireWallet(input.walletId);
  const actual = parseAmount(input.actualBalance, 'actualBalance');
  const computed = await recomputeBalance(wallet.id);

  if (actual.equals(computed)) {
    throw new ApiError(
      'balance_already_matches',
      409,
      'That is the balance the ledger already holds, so there is nothing to reconcile.',
      'actualBalance',
    );
  }

  // Both figures go through the same projection before they are compared, so the difference is a
  // difference in the space net worth uses — which is what makes the card inversion fall out of the
  // arithmetic rather than out of a branch here.
  const difference = value(wallet, actual).minus(value(wallet, computed));

  const direction = difference.isNegative() ? 'expense' : 'income';

  const transaction = await createTransaction({
    actor: input.actor,
    transactionType: direction,
    occurredOn: input.occurredOn,
    walletId: wallet.id,
    categoryId: input.categoryId,
    amount: difference.abs().toFixed(4),
    // The note is the marker ADR-0017 names, spelled exactly; anything else and the row stops being
    // recognisable as a reconciliation.
    notes: BALANCE_DIFFERENCE,
  });

  return {
    direction,
    differenceValue: difference.toFixed(4),
    transaction,
  };
}

/** ADR-0017's marker. Spelled once, because a report or an export that looked for it would spell it too. */
export const BALANCE_DIFFERENCE = 'Balance Difference';
