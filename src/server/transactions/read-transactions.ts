import type { Prisma, TxType } from '@prisma/client';

import { db } from '../db';
import { ApiError } from '../http/errors';
import { parseCalendarDate } from '../time/calendar-date';
import { serialiseTransaction, type TransactionResponse } from './serialise';

/**
 * Reading transactions (FR-04, FR-13, Task 3.8).
 *
 * **`deleted_at: null` is the default and the only way it is omitted is by asking.** A soft-deleted row
 * still carries its amount, so a list that forgets the filter shows money the user removed — and unlike a
 * wrong total, a list with a deleted row in it looks entirely plausible; the row exists, it is just not
 * part of the ledger any more. `includeDeleted` exists so a spec can prove the filter is doing something.
 *
 * The filters are applied at the data layer, scoped to the caller by the extension underneath, so a screen
 * cannot widen them and no route has to remember to (ADR-0020).
 *
 * `occurred_on` bounds are half-open — `from` inclusive, `to` inclusive of the day named — and they are
 * compared as calendar dates, which is what makes a month boundary timezone-independent (ADR-0007).
 */
export interface TransactionQuery {
  from?: string;
  to?: string;
  type?: string;
  walletId?: string;
  categoryId?: string;
  tag?: string;
  search?: string;
  page?: number;
  perPage?: number;
  includeDeleted?: boolean;
}

export interface TransactionPage {
  data: TransactionResponse[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

const TYPES: TxType[] = ['expense', 'income', 'transfer', 'exchange'];

export const DEFAULT_PER_PAGE = 25;
export const MAX_PER_PAGE = 100;

function where(query: TransactionQuery): Prisma.TransactionWhereInput {
  const filter: Prisma.TransactionWhereInput = { deleted_at: query.includeDeleted === true ? undefined : null };

  if (query.from !== undefined) filter.occurred_on = { gte: parseCalendarDate(query.from, 'from') };
  if (query.to !== undefined) {
    filter.occurred_on = { ...(filter.occurred_on as object), lte: parseCalendarDate(query.to, 'to') };
  }

  if (query.type !== undefined) {
    if (!(TYPES as string[]).includes(query.type)) {
      throw new ApiError('validation_failed', 400, 'That is not a transaction type this app knows.', 'type');
    }
    filter.transaction_type = query.type as TxType;
  }

  if (query.walletId !== undefined) {
    // Either leg: a transfer out of this wallet and one into it are both movements of this wallet, and a
    // screen that showed only the outgoing half would hide half of the wallet's history.
    filter.OR = [{ wallet_id: query.walletId }, { destination_wallet_id: query.walletId }];
  }

  if (query.categoryId !== undefined) filter.category_id = query.categoryId;
  if (query.tag !== undefined) filter.tags = { has: query.tag };

  if (query.search !== undefined && query.search.trim() !== '') {
    // FR-13: server-side search over the three free-text columns §13 names — Description, Notes and
    // Merchant — and the trigram indexes behind them are why this is `contains` rather than a prefix
    // match (§3, ADR-0021). Three indexed branches, not two: a fourth field (or a third field left
    // unindexed, which is how `merchant` arrived) turns this into a sequential scan of the ledger, and
    // nothing in the response would say so. `location`, `project` and `receipt_number` are stored on the
    // row and are deliberately not searched — §13 does not name them.
    filter.AND = [
      {
        OR: [
          { description: { contains: query.search, mode: 'insensitive' } },
          { notes: { contains: query.search, mode: 'insensitive' } },
          { merchant: { contains: query.search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  return filter;
}

export async function listTransactions(query: TransactionQuery = {}): Promise<TransactionPage> {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Math.trunc(query.perPage ?? DEFAULT_PER_PAGE)));
  const filter = where(query);

  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where: filter,
      orderBy: [{ occurred_on: 'desc' }, { recorded_at: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.transaction.count({ where: filter }),
  ]);

  return {
    data: rows.map(serialiseTransaction),
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getTransaction(id: string): Promise<TransactionResponse | null> {
  const transaction = await db.transaction.findFirst({ where: { id, deleted_at: null } });

  return transaction === null ? null : serialiseTransaction(transaction);
}

/** The row itself, for a write path that has rules to apply to it before it may change. */
export async function requireTransactionRow(id: string) {
  const transaction = await db.transaction.findFirst({ where: { id, deleted_at: null } });

  if (transaction === null) {
    throw new ApiError('not_found', 404, 'No such transaction.');
  }

  return transaction;
}
