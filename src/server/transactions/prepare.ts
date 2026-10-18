import { Prisma, type TxType } from '@prisma/client';

import type { Caller } from '../context';
import { requireCategoryForType } from '../categories/get-category';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { parseAmount } from '../money/amount';
import { parseCalendarDate } from '../time/calendar-date';
import { requireWallet } from '../wallets/get-wallet';

/**
 * Everything a transaction has to be true about before it can be written, in one place (Task 3.5).
 *
 * The four types are not four shapes of one thing; each one forbids something the others require, and the
 * whole point of this module is that those rules are stated once rather than re-derived in a route, a
 * screen and an import. Read the table as the specification:
 *
 * | type | category | destination wallet | destination amount |
 * |---|---|---|---|
 * | `expense` | required, and must be an expense category | forbidden | forbidden |
 * | `income` | required, and must be an income category | forbidden | forbidden |
 * | `transfer` | forbidden | required, and must differ from the source | optional — required only when the wallets differ in currency |
 * | `exchange` | forbidden | required, and must differ from the source | required |
 *
 * Two decisions in here are load-bearing and easy to undo by accident.
 *
 * **An amount is always positive.** Direction is `transaction_type` and nothing else, so `-50000` is
 * refused rather than stored as an expense — a ledger where a negative expense means a refund and a
 * positive one means a spend is a ledger whose arithmetic depends on a sign convention that no column
 * documents. A refund is an `income` row, or it is a `transfer` back.
 *
 * **`base_amount` is stated or inferable, never computed from a rate.** When the source wallet holds the
 * caller's primary currency the base figure is the amount itself; otherwise the caller states it, because
 * there is no rate table to look it up in and there must never be one (ADR-0004). The stored figure is
 * frozen, so a total for a past month cannot move later.
 */
const TYPES: TxType[] = ['expense', 'income', 'transfer', 'exchange'];

export interface NewTransaction {
  actor: Caller;
  transactionType: string;
  occurredOn: string;
  walletId: string;
  destinationWalletId?: string | null;
  categoryId?: string | null;
  amount: string;
  destinationAmount?: string | null;
  baseAmount?: string | null;
  description?: string | null;
  notes?: string | null;
  tags?: string[];
  merchant?: string | null;
  location?: string | null;
  project?: string | null;
  receiptNumber?: string | null;
}

/** The row a create will insert, with every field the endpoint owns already decided. */
export interface PreparedTransaction {
  transaction_type: TxType;
  occurred_on: Date;
  wallet_id: string;
  destination_wallet_id: string | null;
  category_id: string | null;
  amount: Prisma.Decimal;
  currency_id: string;
  base_amount: Prisma.Decimal;
  base_currency_id: string;
  destination_amount: Prisma.Decimal | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  merchant: string | null;
  location: string | null;
  project: string | null;
  receipt_number: string | null;
}

function requireType(value: string): TxType {
  if (!(TYPES as string[]).includes(value)) {
    throw new ApiError('validation_failed', 400, 'That is not a transaction type this app knows.', 'transactionType');
  }

  return value as TxType;
}

function requirePositive(amount: Prisma.Decimal, field: string): Prisma.Decimal {
  if (!amount.greaterThan(0)) {
    throw new ApiError(
      'validation_failed',
      400,
      `${field} must be greater than zero — the direction of a transaction is its type, never its sign.`,
      field,
    );
  }

  return amount;
}

function readTags(tags: string[] | undefined): string[] {
  if (tags === undefined) return [];

  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.trim() === '') {
      throw new ApiError('validation_failed', 400, 'Every tag must be text.', 'tags');
    }
  }

  return [...new Set(tags.map((tag) => tag.trim()))];
}

/** The narrowing that lets a category be required by `income` and `expense` and forbidden by the rest. */
function isIncomeOrExpense(type: TxType): type is 'income' | 'expense' {
  return type === 'income' || type === 'expense';
}

export async function prepareTransaction(input: NewTransaction): Promise<PreparedTransaction> {
  const transaction_type = requireType(input.transactionType);
  const occurred_on = parseCalendarDate(input.occurredOn, 'occurredOn');
  const amount = requirePositive(parseAmount(input.amount, 'amount'), 'amount');

  const wallet = await requireWallet(input.walletId);

  const movesBetweenWallets = transaction_type === 'transfer' || transaction_type === 'exchange';

  if (movesBetweenWallets) {
    if (input.destinationWalletId === undefined || input.destinationWalletId === null) {
      throw new ApiError('validation_failed', 400, 'A transfer needs a wallet to arrive in.', 'destinationWalletId');
    }

    if (input.destinationWalletId === input.walletId) {
      throw new ApiError(
        'validation_failed',
        400,
        'A transfer needs two different wallets.',
        'destinationWalletId',
      );
    }

    if (input.categoryId !== undefined && input.categoryId !== null) {
      throw new ApiError(
        'validation_failed',
        400,
        'A transfer is neither income nor expense, so it cannot carry a category.',
        'categoryId',
      );
    }
  }

  // Which half of the type table we are in decides whether a category is required or forbidden, and the
  // narrowing is done by the guard rather than by an assertion: a value that is neither `income` nor
  // `expense` never reaches the line that needs one.
  let category = null;
  if (isIncomeOrExpense(transaction_type)) {
    if (input.categoryId === undefined || input.categoryId === null) {
      throw new ApiError('validation_failed', 400, 'An income or an expense needs a category.', 'categoryId');
    }

    // A category's type and the transaction's are the same fact seen twice, and the database cannot check
    // it across two tables — which is why it is checked here (`categories/get-category.ts`).
    category = await requireCategoryForType(input.categoryId, transaction_type);
  }

  const destination = movesBetweenWallets
    ? await requireWallet(input.destinationWalletId as string)
    : null;

  if (movesBetweenWallets && input.destinationAmount !== undefined && input.destinationAmount !== null && transaction_type === 'transfer' && destination !== null && destination.currency_id === wallet.currency_id) {
    // A same-currency transfer has one amount, and storing a second invites the two to disagree.
    throw new ApiError(
      'validation_failed',
      400,
      'Both wallets hold the same currency, so there is nothing for a destination amount to say.',
      'destinationAmount',
    );
  }

  const destination_amount =
    input.destinationAmount === undefined || input.destinationAmount === null
      ? null
      : requirePositive(parseAmount(input.destinationAmount, 'destinationAmount'), 'destinationAmount');

  if (transaction_type === 'exchange' && destination_amount === null) {
    throw new ApiError(
      'validation_failed',
      400,
      'An exchange needs the amount that arrived in the other wallet.',
      'destinationAmount',
    );
  }

  if (
    transaction_type === 'transfer' &&
    destination !== null &&
    destination.currency_id !== wallet.currency_id &&
    destination_amount === null
  ) {
    throw new ApiError(
      'validation_failed',
      400,
      'These two wallets hold different currencies, so the amount that arrived is required.',
      'destinationAmount',
    );
  }

  const user = await db.user.findUnique({ where: { id: input.actor.id }, select: { primary_currency_id: true } });
  if (user === null) {
    throw new ApiError('not_found', 404, 'No such account.');
  }

  const statedBase = input.baseAmount === undefined || input.baseAmount === null
    ? null
    : requirePositive(parseAmount(input.baseAmount, 'baseAmount'), 'baseAmount');

  if (statedBase === null && wallet.currency_id !== user.primary_currency_id) {
    throw new ApiError(
      'base_amount_required',
      400,
      `This wallet holds ${wallet.currency_id}, so the figure in ${user.primary_currency_id} has to be stated.`,
      'baseAmount',
    );
  }

  return {
    transaction_type,
    occurred_on,
    wallet_id: wallet.id,
    destination_wallet_id: destination?.id ?? null,
    category_id: category?.id ?? null,
    amount,
    currency_id: wallet.currency_id,
    base_amount: statedBase ?? amount,
    base_currency_id: user.primary_currency_id,
    destination_amount,
    description: input.description ?? null,
    notes: input.notes ?? null,
    tags: readTags(input.tags),
    merchant: input.merchant ?? null,
    location: input.location ?? null,
    project: input.project ?? null,
    receipt_number: input.receiptNumber ?? null,
  };
}
