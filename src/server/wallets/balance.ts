import { Prisma, type TxType } from '@prisma/client';

import type { Transaction } from '../audit';
import { db } from '../db';
import { balanceDelta, type MovementRole, type WalletLike } from '../money/direction';

/**
 * `current_balance`, recomputed from the rows that justify it — the only writer in the application.
 *
 * Two decisions are folded into this file, and both are load-bearing.
 *
 * **It recomputes rather than applies a delta.** The alternative — read the stored balance, add the
 * movement, write it back — is one arithmetic step cheaper and can drift: any path that writes a
 * transaction without updating the balance leaves a wrong number that nothing ever revisits, and a
 * wrong balance is invisible in every screen that shows it until a reconciliation disagrees. Rebuilding
 * the figure from the transactions each time cannot drift, because there is nothing to drift from. The
 * ledger is one person's, and reading a wallet's rows to answer "what does this wallet hold" is the
 * price of a number that is true.
 *
 * **`deleted_at IS NULL` is not optional here.** A soft-deleted row still holds its amount (ADR-0005),
 * so summing without the filter counts money the user removed. This is the one query where forgetting
 * it silently inflates a wallet balance instead of failing.
 *
 * The sign is never computed here. `direction.ts` decides what a movement does to a balance — that is
 * the pair of rules ADR-0025 exists to keep in one place, and a `-` written in this file would be the
 * second place they live.
 */
const SCOPED_DB = db as unknown as Transaction;

/**
 * Which source-side role a movement plays.
 *
 * `transfer` and `exchange` leave the source wallet the same way an expense does — money goes out — and
 * that is the whole reason they are `out` rather than types of their own in the direction table. The
 * arrival leg is always `in`, for both.
 */
const SOURCE_ROLE: Record<TxType, MovementRole> = {
  expense: 'expense',
  income: 'income',
  transfer: 'out',
  exchange: 'out',
};

export type BalanceClient = Transaction;

/**
 * What the wallet's transactions add up to, `opening_balance` included: the value `current_balance`
 * must equal. Reads only — it writes nothing, which is what makes it usable as the assertion in a spec.
 */
export async function recomputeBalance(
  walletId: string,
  client: BalanceClient = SCOPED_DB,
): Promise<Prisma.Decimal> {
  const wallet = await client.wallet.findUnique({
    where: { id: walletId },
    select: { opening_balance: true, is_liability: true },
  });

  if (wallet === null) {
    // Neither the caller's nor anybody's: the scoping extension has already narrowed this to the
    // caller's rows, so an absent wallet is a 404 rather than a leak.
    throw new Error(`Cannot recompute the balance of wallet ${walletId}: no such wallet.`);
  }

  const movements = await client.transaction.findMany({
    where: {
      deleted_at: null,
      OR: [{ wallet_id: walletId }, { destination_wallet_id: walletId }],
    },
    select: {
      wallet_id: true,
      transaction_type: true,
      amount: true,
      destination_amount: true,
    },
  });

  let balance = wallet.opening_balance;
  const owner: WalletLike = { is_liability: wallet.is_liability };

  for (const movement of movements) {
    if (movement.wallet_id === walletId) {
      balance = balance.plus(balanceDelta(owner, SOURCE_ROLE[movement.transaction_type], movement.amount));
      continue;
    }

    // This wallet is the *destination* leg — money arrives, so the role is `in`. A same-currency
    // transfer stores no `destination_amount` (ADR-0004 only stores it when the two wallets differ),
    // and the arriving amount is then the departing one.
    balance = balance.plus(
      balanceDelta(owner, 'in', movement.destination_amount ?? movement.amount),
    );
  }

  return balance;
}

/**
 * Recompute and store, inside the caller's transaction. Every money-changing write ends by calling
 * this for each wallet it touched, so the stored balance is a consequence of the rows rather than a
 * figure maintained alongside them.
 */
export async function syncBalance(
  walletId: string,
  client: BalanceClient,
): Promise<Prisma.Decimal> {
  const balance = await recomputeBalance(walletId, client);

  await client.wallet.update({ where: { id: walletId }, data: { current_balance: balance } });

  return balance;
}

/**
 * Both legs of a movement in one call. A transfer whose source was synced and whose destination was
 * not is the failure mode this exists to make hard to write.
 */
export async function syncBalances(walletIds: string[], client: BalanceClient): Promise<void> {
  for (const walletId of [...new Set(walletIds)]) {
    await syncBalance(walletId, client);
  }
}

/**
 * The wallets a row touches: the source always, the destination when there is one.
 *
 * It takes a row rather than two ids because the caller has a row and the mistake this prevents is passing
 * `wallet_id` twice. Every write path — create, edit, delete, restore, reconcile — asks this question, and
 * a delete that synced only the source would leave a deleted transfer's arrival still counted in the wallet
 * it arrived in.
 */
export function walletLegsOf(row: {
  wallet_id: string;
  destination_wallet_id: string | null;
}): string[] {
  return row.destination_wallet_id === null
    ? [row.wallet_id]
    : [row.wallet_id, row.destination_wallet_id];
}

/** The same question for a row that is about to change: every wallet the old shape and the new one touch. */
export function walletLegsBeforeAndAfter(
  before: { wallet_id: string; destination_wallet_id: string | null },
  after: { wallet_id: string; destination_wallet_id: string | null },
): string[] {
  return [...new Set([...walletLegsOf(before), ...walletLegsOf(after)])];
}
