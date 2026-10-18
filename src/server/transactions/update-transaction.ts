import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { money } from '../money/amount';
import {
  syncBalances,
  walletLegsBeforeAndAfter,
  walletLegsOf,
} from '../wallets/balance';
import { auditView } from './create-transaction';
import { prepareTransaction, type NewTransaction } from './prepare';
import { requireTransactionRow } from './read-transactions';
import { serialiseTransaction, type TransactionResponse } from './serialise';

/**
 * Editing and removing a transaction (FR-06, FR-05, Tasks 3.7–3.8).
 *
 * **An edit re-runs every rule.** The merged row goes back through `prepareTransaction`, so a changed
 * amount is still required to be positive, an `expense` still needs an expense category, and a `transfer`
 * still needs two different wallets. The alternative — validating only the fields present in the patch —
 * means a row can be edited into a state that could never have been created, and nothing reports it
 * because every individual step was legal.
 *
 * **The merged shape is what makes that possible**, and it is also why this is a full replacement of the
 * derived fields rather than a partial update: `currency_id` and `base_currency_id` are not patchable, they
 * are consequences of the wallets and the user's primary currency, and they are rewritten on every edit.
 *
 * **Every wallet the row touched is rebuilt, before and after.** Moving a transaction from one wallet to
 * another has to fix two balances, and a delete has to put the money back — a `deleted_at` that left the
 * balance alone would remove the row from the list while it kept counting toward the wallet total.
 */
export type TransactionEdit = Partial<NewTransaction>;

function merged(row: Awaited<ReturnType<typeof requireTransactionRow>>, edit: TransactionEdit): NewTransaction {
  const pick = <T>(next: T | undefined, current: T): T => (next === undefined ? current : next);

  return {
    actor: edit.actor as Caller,
    transactionType: pick(edit.transactionType, row.transaction_type),
    occurredOn: pick(edit.occurredOn, row.occurred_on.toISOString().slice(0, 10)),
    walletId: pick(edit.walletId, row.wallet_id),
    destinationWalletId: pick(edit.destinationWalletId, row.destination_wallet_id),
    categoryId: pick(edit.categoryId, row.category_id),
    amount: pick(edit.amount, money(row.amount)),
    destinationAmount: pick(
      edit.destinationAmount,
      row.destination_amount === null ? null : money(row.destination_amount),
    ),
    baseAmount: pick(edit.baseAmount, money(row.base_amount)),
    description: pick(edit.description, row.description),
    notes: pick(edit.notes, row.notes),
    tags: pick(edit.tags, row.tags),
    merchant: pick(edit.merchant, row.merchant),
    location: pick(edit.location, row.location),
    project: pick(edit.project, row.project),
    receiptNumber: pick(edit.receiptNumber, row.receipt_number),
  };
}

export async function updateTransaction(input: {
  actor: Caller;
  id: string;
  edit: TransactionEdit;
}): Promise<TransactionResponse> {
  if (Object.keys(input.edit).length === 0) {
    throw new ApiError('validation_failed', 400, 'Nothing to change.');
  }

  const before = await requireTransactionRow(input.id);
  const prepared = await prepareTransaction(merged(before, { ...input.edit, actor: input.actor }));

  return writeAudited({
    actor: input.actor,
    entityType: 'transaction',
    action: 'updated',
    before: auditView(before),
    run: async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id: input.id },
        data: prepared,
      });

      await syncBalances(walletLegsBeforeAndAfter(before, transaction), tx);

      return { written: transaction, entityId: transaction.id, after: auditView(transaction) };
    },
  }).then(serialiseTransaction);
}

/**
 * Soft-deleting a transaction (ADR-0005).
 *
 * The row stays and keeps its amount; `deleted_at` is what takes it out of the ledger. So the balances are
 * rebuilt in the same transaction — this is the write where forgetting them is most visible, because the
 * transaction disappears from the list while the money it moved would otherwise stay counted.
 *
 * A second delete is a 404 rather than a no-op: the row is already deleted, and the caller is asking about
 * something that is no longer there.
 */
export async function deleteTransaction(input: { actor: Caller; id: string }): Promise<{ status: 'ok' }> {
  const before = await requireTransactionRow(input.id);

  await writeAudited({
    actor: input.actor,
    entityType: 'transaction',
    action: 'deleted',
    before: auditView(before),
    run: async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });

      await syncBalances(walletLegsOf(transaction), tx);

      return {
        written: transaction,
        entityId: transaction.id,
        after: { deleted_at: transaction.deleted_at?.toISOString() ?? null },
      };
    },
  });

  return { status: 'ok' };
}

/**
 * Putting a soft-deleted transaction back (Task 3.8).
 *
 * Restoring is the inverse of deleting and nothing more: the row is unchanged, so the only thing to rebuild
 * is the balances. It is deliberately not a new transaction — restoring is a correction of a mistake, and
 * a row that was never removed should not acquire a second identity.
 */
export async function restoreTransaction(input: {
  actor: Caller;
  id: string;
}): Promise<TransactionResponse> {
  const deleted = await dbTransactionDeleted(input.id);

  return writeAudited({
    actor: input.actor,
    entityType: 'transaction',
    action: 'restored',
    before: auditView(deleted),
    run: async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id: input.id },
        data: { deleted_at: null },
      });

      await syncBalances(walletLegsOf(transaction), tx);

      return { written: transaction, entityId: transaction.id, after: auditView(transaction) };
    },
  }).then(serialiseTransaction);
}

/** Restoring looks for the row a delete hid, so it cannot use the reader that hides it. */
async function dbTransactionDeleted(id: string) {
  const transaction = await db.transaction.findFirst({ where: { id } });

  if (transaction === null || transaction.deleted_at === null) {
    throw new ApiError('not_found', 404, 'No deleted transaction with that id.');
  }

  return transaction;
}
