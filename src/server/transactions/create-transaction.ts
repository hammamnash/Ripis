import type { Transaction } from '@prisma/client';

import { writeAudited } from '../audit';
import { money } from '../money/amount';
import { syncBalances, walletLegsOf } from '../wallets/balance';
import { prepareTransaction, type NewTransaction } from './prepare';
import { serialiseTransaction, type TransactionResponse } from './serialise';

/**
 * Recording a transaction (FR-01–FR-03, Task 3.5).
 *
 * One row per event, always: the reference export renders a cross-currency transfer as two mirrored rows
 * and this application does not, because two rows that must agree are two rows that can disagree. Export
 * synthesises the pair, and it round-trips (ADR-0008).
 *
 * The write and the balance update are one transaction, and so is the audit row (`writeAudited`). The
 * sequence that matters is: insert the row, then rebuild **every** wallet the row touches. A wallet whose
 * balance was not rebuilt is a wrong number nothing will revisit.
 */
export async function createTransaction(input: NewTransaction): Promise<TransactionResponse> {
  const prepared = await prepareTransaction(input);

  return writeAudited({
    actor: input.actor,
    entityType: 'transaction',
    action: 'created',
    run: async (tx) => {
      const transaction = await tx.transaction.create({
        data: { ...prepared, user_id: input.actor.id },
      });

      await syncBalances(walletLegsOf(transaction), tx);

      return {
        written: transaction,
        entityId: transaction.id,
        after: auditView(transaction),
      };
    },
  }).then(serialiseTransaction);
}

/**
 * What the audit row says about a transaction.
 *
 * The amount is a string, not a `Decimal` — a `Json` column would serialise a Decimal by whatever handled
 * it next, which is the conversion ADR-0012 forbids. `description` is deliberately absent: §14's retention
 * compacts these rows, and a note a person typed about their own spending belongs in the transaction, not
 * duplicated into an append-only table.
 */
export function auditView(transaction: Transaction) {
  return {
    transaction_type: transaction.transaction_type,
    occurred_on: transaction.occurred_on.toISOString().slice(0, 10),
    wallet_id: transaction.wallet_id,
    destination_wallet_id: transaction.destination_wallet_id,
    amount: money(transaction.amount),
    currency_id: transaction.currency_id,
    base_amount: money(transaction.base_amount),
    base_currency_id: transaction.base_currency_id,
  };
}
