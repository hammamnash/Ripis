import type { Prisma, Transaction, TxType } from '@prisma/client';

import { money } from '../money/amount';

/**
 * The transaction in its wire shape (`02-context.md` §6).
 *
 * Three fields exist here for reasons that are easy to lose:
 *
 * - **`occurredOn` is a calendar date** (`"2026-10-31"`), and `recordedAt` is a timestamp. They are
 *   different types on purpose: a report may only read the first, and anything that cannot tell them
 *   apart will eventually report a Jakarta evening in the wrong month (ADR-0007).
 * - **Every amount is a string.** `amount`, `destinationAmount` and `baseAmount` cross the wire as
 *   decimals in text, never as JSON numbers (ADR-0012).
 * - **`baseAmount` is sent even though it is derived**, because it is *frozen* (ADR-0004). It was true
 *   when the row was written and it does not move afterwards, which is what keeps a September total from
 *   changing when a rate changes in October.
 */
export interface TransactionResponse {
  id: string;
  transactionType: Transaction['transaction_type'];
  occurredOn: string;
  recordedAt: string;
  walletId: string;
  destinationWalletId: string | null;
  categoryId: string | null;
  amount: string;
  currencyId: string;
  baseAmount: string;
  baseCurrencyId: string;
  destinationAmount: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  merchant: string | null;
  location: string | null;
  project: string | null;
  receiptNumber: string | null;
}

export function serialiseTransaction(transaction: Transaction): TransactionResponse {
  return {
    id: transaction.id,
    transactionType: transaction.transaction_type,
    occurredOn: calendarDateOf(transaction.occurred_on),
    recordedAt: transaction.recorded_at.toISOString(),
    walletId: transaction.wallet_id,
    destinationWalletId: transaction.destination_wallet_id,
    categoryId: transaction.category_id,
    amount: money(transaction.amount),
    currencyId: transaction.currency_id,
    baseAmount: money(transaction.base_amount),
    baseCurrencyId: transaction.base_currency_id,
    destinationAmount:
      transaction.destination_amount === null ? null : money(transaction.destination_amount),
    description: transaction.description,
    notes: transaction.notes,
    tags: transaction.tags,
    merchant: transaction.merchant,
    location: transaction.location,
    project: transaction.project,
    receiptNumber: transaction.receipt_number,
  };
}

/**
 * A `@db.Date` column reads back as a `Date` at UTC midnight, and the day it names is what the client
 * asked for. Slicing the ISO string is the same rule `calendarDate()` states, kept local here because a
 * transaction serialiser that imported the parser would suggest the two are interchangeable — one reads a
 * date out of a stored row, the other builds one out of submitted text, and only the second has anything
 * to validate.
 */
function calendarDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The `where` a list query runs with, so the filters and the count are impossible to disagree. */
export type TransactionFilter = Prisma.TransactionWhereInput;

export type { TxType };
