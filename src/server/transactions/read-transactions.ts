import type { Prisma, TxType } from '@prisma/client';

import { db } from '../db';
import { ApiError } from '../http/errors';
import { parseAmount } from '../money/amount';
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
  /**
   * A set of types, for the one filter the screen states as a single control: the list's **Transfer** chip
   * means "money moved", and an `exchange` is the same movement between two currencies. Naming both here
   * rather than teaching the screen to merge two responses keeps the count and the rows impossible to disagree.
   * Ignored when `type` is given — one type is the narrower statement.
   */
  typeIn?: string[];
  walletId?: string;
  categoryId?: string;
  tag?: string;
  amountMin?: string;
  amountMax?: string;
  currency?: string;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An id-shaped filter, checked before it reaches the database.
 *
 * A malformed id is compared against a `uuid` column and comes back as a driver error, which the error
 * handler can only report as a `500 internal_error` — so a value a user can edit into the address bar
 * becomes "something went wrong on our side", and the log fills with faults that are not faults. Measured on
 * `?walletId=not-a-uuid` (2026-10-19): a 500 with no hint of which parameter caused it. Checked here, it is
 * the same `400 validation_failed` every other bad value on this endpoint produces, naming the field.
 */
function filterId(value: string, field: string): string {
  if (!UUID.test(value)) {
    throw new ApiError('validation_failed', 400, `${field} must be a UUID.`, field);
  }

  return value;
}

function where(query: TransactionQuery): Prisma.TransactionWhereInput {
  const filter: Prisma.TransactionWhereInput = { deleted_at: query.includeDeleted === true ? undefined : null };

  if (query.from !== undefined) filter.occurred_on = { gte: parseCalendarDate(query.from, 'from') };
  if (query.to !== undefined) {
    filter.occurred_on = { ...(filter.occurred_on as object), lte: parseCalendarDate(query.to, 'to') };
  }

  /* `type` is the narrow form and `typeIn` the wide one; collapsing them here means the validation, the filter
     and the count all read the same list. */
  const types = query.type !== undefined ? [query.type] : query.typeIn;

  if (types !== undefined && types.length > 0) {
    for (const type of types) {
      if (!(TYPES as string[]).includes(type)) {
        throw new ApiError('validation_failed', 400, 'That is not a transaction type this app knows.', 'type');
      }
    }

    filter.transaction_type = types.length === 1 ? (types[0] as TxType) : { in: types as TxType[] };
  }

  if (query.walletId !== undefined) {
    // Either leg: a transfer out of this wallet and one into it are both movements of this wallet, and a
    // screen that showed only the outgoing half would hide half of the wallet's history.
    const walletId = filterId(query.walletId, 'walletId');

    filter.OR = [{ wallet_id: walletId }, { destination_wallet_id: walletId }];
  }

  if (query.categoryId !== undefined) filter.category_id = filterId(query.categoryId, 'categoryId');
  if (query.tag !== undefined) filter.tags = { has: query.tag };

  // Amount Range reads `base_amount`, never `amount`, and `(user_id, base_amount)` is the only amount index
  // there is. A range over six currencies in their own units compares nothing to nothing — 1,200,000 in a
  // zero-decimal currency is not "bigger" than 63 dollars — so the comparable figure is the frozen base
  // amount, and the label on the screen has to name the primary currency (§3, §13, ADR-0004). The bounds stay
  // decimals: `Number()` on money is the defect §10 names, and it would round the bound before comparing it.
  const min = query.amountMin === undefined ? undefined : parseAmount(query.amountMin, 'amountMin');
  const max = query.amountMax === undefined ? undefined : parseAmount(query.amountMax, 'amountMax');

  if (min !== undefined && max !== undefined && min.greaterThan(max)) {
    // Not a filter that matches nothing — a filter that cannot have been meant. Answering `data: []` to it
    // would look like an empty ledger.
    throw new ApiError(
      'validation_failed',
      400,
      'amountMin is above amountMax, which can only match nothing.',
      'amountMin',
    );
  }

  if (min !== undefined || max !== undefined) {
    filter.base_amount = { ...(min === undefined ? {} : { gte: min }), ...(max === undefined ? {} : { lte: max }) };
  }

  // The transaction's **own** currency. `base_currency_id` is the user's primary currency by definition
  // (ADR-0004, ADR-0015), so a filter on it would keep every row and tell a screen nothing. A transfer is
  // filtered by the currency it left in rather than either leg, which is the same choice the amount columns
  // make: the row has one currency, and its destination is a separate column (§12).
  if (query.currency !== undefined && query.currency.trim() !== '') {
    const code = query.currency.trim().toUpperCase();

    if (!/^[A-Z0-9]{3,4}$/.test(code)) {
      throw new ApiError('validation_failed', 400, 'That is not a currency code.', 'currency');
    }

    filter.currency_id = code;
  }

  if (query.search !== undefined && query.search.trim() !== '') {
    // FR-13: server-side search over the three free-text columns §13 names — Description, Notes and
    // Merchant — and the trigram indexes behind them are why this is `contains` rather than a prefix
    // match (§3, ADR-0021). Three indexed branches, not two: a fourth field (or a third field left
    // unindexed, which is how `merchant` arrived) turns this into a sequential scan of the ledger, and
    // nothing in the response would say so. `location`, `project` and `receipt_number` are stored on the
    // row and are deliberately not searched — §13 does not name them.
    //
    // The row's **caption** — the category's name and the wallets it moved between — is searched as well.
    // Those names are what the row actually shows, so a search that could not find "Transport" while every
    // Transport row sat on screen reads as broken, and the names only exist on joined tables. No trigram
    // index reaches them; `category` and `wallet` are tiny per-user tables compared by primary key, so the
    // month bounds still decide how many transaction rows are read before the join happens.
    const contains = { contains: query.search.trim(), mode: 'insensitive' } as const;

    filter.AND = [
      {
        OR: [
          { description: contains },
          { notes: contains },
          { merchant: contains },
          { category: { is: { name: contains } } },
          { wallet: { is: { name: contains } } },
          { destination: { is: { name: contains } } },
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
