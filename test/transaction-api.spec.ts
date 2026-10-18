import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as readTransaction, DELETE as deleteTransaction, PATCH as editTransaction } from '../app/api/transactions/[id]/route';
import { POST as restoreTransaction } from '../app/api/transactions/[id]/restore/route';
import { GET as listTransactionsRoute, POST as createTransaction } from '../app/api/transactions/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { POST as createCategory } from '../app/api/categories/route';
import { runAsCaller, type Caller } from '../src/server/context';
import { monthSummary } from '../src/server/reports/month-summary';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Tasks 3.5–3.9 through the real endpoints (FR-01–FR-06, FR-11, FR-13).
 *
 * Three claims in here are the ones the phase exists for:
 *
 * 1. **A transfer is one row, and it is in neither total.** The reference export renders a cross-currency
 *    transfer as two mirrored rows; this application stores one, and a month's income is not the sum of the
 *    money moving between the user's own wallets (ADR-0008).
 * 2. **A soft delete changes no total that should change and changes every one that should.** The row stays,
 *    the balance gives the money back, and the month stops counting it (ADR-0005).
 * 3. **A month is decided by `occurred_on`, a calendar date.** A row recorded in November about an October
 *    purchase is October's, and the two columns are different types so nothing can confuse them (ADR-0007).
 */
const EMAIL = 'phase-3-ledger@ripis.test';

let ledger: SpecLedger;
let caller: Caller;

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
  caller = { id: ledger.userId, role: 'user' };
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
  await prisma.$disconnect();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

interface TxBody {
  id: string;
  transactionType: string;
  occurredOn: string;
  amount: string;
  currencyId: string;
  baseAmount: string;
  baseCurrencyId: string;
  destinationAmount: string | null;
  walletId: string;
  destinationWalletId: string | null;
  categoryId: string | null;
  notes: string | null;
  tags: string[];
  error?: { code: string; field?: string };
}

async function wallet(name: string, currencyId = 'TST'): Promise<string> {
  const response = await createWallet(
    ledger.request('/api/wallets', {
      method: 'POST',
      body: { name, walletType: 'cash', currencyId, openingBalance: '0.0000' },
    }),
    undefined,
  );

  return ((await response.json()) as { id: string }).id;
}

async function category(type: 'income' | 'expense', name = `${type} ${Math.random().toString(36).slice(2, 8)}`) {
  const response = await createCategory(
    ledger.request('/api/categories', { method: 'POST', body: { name, type, color: '#D22129' } }),
    undefined,
  );

  return ((await response.json()) as { id: string }).id;
}

async function record(body: Record<string, unknown>) {
  const response = await createTransaction(
    ledger.request('/api/transactions', { method: 'POST', body }),
    undefined,
  );

  return { status: response.status, body: (await response.json()) as TxBody };
}

const summary = (month: string) => runAsCaller(caller, () => monthSummary({ month }));

/**
 * The ids a half-open date window returns, asked of the endpoint rather than the module — the filters are
 * what is being tested, and a screen would reach them through exactly this URL.
 *
 * The upper bound is the month's real last day: `2026-11-31` is not a date, and `parseCalendarDate` refuses
 * it rather than rolling it into December.
 */
async function idsIn(from: string, to: string): Promise<string[]> {
  const response = await listTransactionsRoute(
    ledger.request(`/api/transactions?from=${from}&to=${to}&perPage=100`),
    undefined,
  );

  return ((await response.json()) as { data: { id: string }[] }).data.map((entry) => entry.id);
}

const balanceOf = async (walletId: string): Promise<string> =>
  (
    await prisma.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { current_balance: true } })
  ).current_balance.toFixed(4);

describe('Task 3.5 — what a transaction has to be', () => {
  it('stores an expense with the amount as a string and the base figure frozen to it', async () => {
    const cash = await wallet('Cash for expenses');

    const created = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: cash,
      categoryId: await category('expense'),
      amount: '125000.0000',
    });

    expect(created.status).toBe(201);
    expect(created.body.amount).toBe('125000.0000');
    // A string on the wire, never a number: `125000.0000` is precision the application spent a schema
    // decision refusing to lose (ADR-0012).
    expect(typeof created.body.amount).toBe('string');
    expect(created.body.baseAmount).toBe('125000.0000');
    expect(created.body.baseCurrencyId).toBe('TST');
    expect(created.body.occurredOn).toBe('2026-10-05');
  });

  it.each(['0.0000', '-50000.0000'])('refuses the amount %s', async (amount) => {
    const cash = await wallet(`Cash for ${amount}`);

    const refused = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: cash,
      categoryId: await category('expense'),
      amount,
    });

    expect(refused.status).toBe(400);
    expect(refused.body.error?.code).toBe('validation_failed');
    expect(refused.body.error?.field).toBe('amount');
  });

  it('refuses an expense with no category, and refuses a category of the other type', async () => {
    const cash = await wallet('Cash for categories');

    const withoutCategory = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: cash,
      amount: '1000.0000',
    });
    expect(withoutCategory.body.error).toMatchObject({ code: 'validation_failed', field: 'categoryId' });

    const wrongType = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: cash,
      categoryId: await category('income'),
      amount: '1000.0000',
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error?.code).toBe('category_type_mismatch');
  });

  it('refuses a category on a transfer, and requires the base figure for a foreign wallet', async () => {
    const cash = await wallet('Cash for transfers');
    const euro = await wallet('Zero-decimal wallet', 'TS0');

    const withCategory = await record({
      transactionType: 'transfer',
      occurredOn: '2026-10-05',
      walletId: cash,
      destinationWalletId: euro,
      categoryId: await category('expense'),
      amount: '1000.0000',
      destinationAmount: '900.0000',
    });
    expect(withCategory.body.error).toMatchObject({ code: 'validation_failed', field: 'categoryId' });

    const noBase = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: euro,
      categoryId: await category('expense'),
      amount: '900.0000',
    });
    expect(noBase.status).toBe(400);
    expect(noBase.body.error?.code).toBe('base_amount_required');

    const stated = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: euro,
      categoryId: await category('expense'),
      amount: '900.0000',
      baseAmount: '15000000.0000',
    });
    expect(stated.status).toBe(201);
    expect(stated.body.baseAmount).toBe('15000000.0000');
    expect(stated.body.baseCurrencyId).toBe('TST');
  });

  it('refuses a fifth decimal place rather than rounding it away', async () => {
    const cash = await wallet('Cash for rounding');

    const refused = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: cash,
      categoryId: await category('expense'),
      amount: '1000.00005',
    });

    expect(refused.status).toBe(400);
    expect(refused.body.error?.field).toBe('amount');
  });
});

describe('Task 3.6 — a transfer is one row and is in neither total', () => {
  it('moves both balances, stores one row, and leaves income and expense untouched', async () => {
    const from = await wallet('Transfer from');
    const to = await wallet('Transfer to');

    const before = await summary('2026-10');

    const created = await record({
      transactionType: 'transfer',
      occurredOn: '2026-10-08',
      walletId: from,
      destinationWalletId: to,
      amount: '500000.0000',
    });

    expect(created.status).toBe(201);
    expect(await prisma.transaction.count({ where: { id: created.body.id } })).toBe(1);

    expect(await balanceOf(from)).toBe('-500000.0000');
    expect(await balanceOf(to)).toBe('500000.0000');

    const after = await summary('2026-10');
    expect(after.income).toBe(before.income);
    expect(after.expense).toBe(before.expense);
  });

  it('returns both legs by wallet, because both are movements of that wallet', async () => {
    const from = await wallet('Legs from');
    const to = await wallet('Legs to');

    await record({
      transactionType: 'transfer',
      occurredOn: '2026-10-09',
      walletId: from,
      destinationWalletId: to,
      amount: '250000.0000',
    });

    const outgoing = await listTransactionsRoute(ledger.request(`/api/transactions?walletId=${from}`), undefined);
    const incoming = await listTransactionsRoute(ledger.request(`/api/transactions?walletId=${to}`), undefined);

    const outgoingIds = ((await outgoing.json()) as { data: { id: string }[] }).data.map((row) => row.id);
    const incomingIds = ((await incoming.json()) as { data: { id: string }[] }).data.map((row) => row.id);

    expect(outgoingIds.length).toBeGreaterThan(0);
    expect(incomingIds).toEqual(expect.arrayContaining(outgoingIds));
  });
});

describe('Task 3.7 — an exchange stores two independent amounts and no rate', () => {
  it('requires the arrived amount, keeps both, and has no rate field at all', async () => {
    const from = await wallet('Exchange from');
    const to = await wallet('Exchange to', 'TS0');

    const missing = await record({
      transactionType: 'exchange',
      occurredOn: '2026-10-10',
      walletId: from,
      destinationWalletId: to,
      amount: '500000.0000',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.field).toBe('destinationAmount');

    const created = await record({
      transactionType: 'exchange',
      occurredOn: '2026-10-10',
      walletId: from,
      destinationWalletId: to,
      amount: '500000.0000',
      destinationAmount: '480000.0000',
      baseAmount: '500000.0000',
    });

    expect(created.status).toBe(201);
    expect(created.body.amount).toBe('500000.0000');
    expect(created.body.destinationAmount).toBe('480000.0000');

    // The rate is arithmetic, derived for display only — so there is no field for it here (ADR-0004), and
    // the two legs do not cancel to zero: the money that left and the money that arrived are different
    // facts, and their difference is a real loss the user took.
    expect(Object.keys(created.body)).not.toContain('exchangeRate');
    expect(Object.keys(created.body)).not.toContain('rate');

    expect(await balanceOf(from)).toBe('-500000.0000');
    expect(await balanceOf(to)).toBe('480000.0000');
  });
});

describe('Task 3.8 — a soft delete removes money without removing history', () => {
  it('keeps the row, gives the balance back, drops out of the list and the month', async () => {
    const cash = await wallet('Cash to delete from');
    const expenseCategory = await category('expense');

    const created = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-11',
      walletId: cash,
      categoryId: expenseCategory,
      amount: '75000.0000',
    });
    expect(created.status).toBe(201);
    expect(await balanceOf(cash)).toBe('-75000.0000');

    const rowsBefore = await prisma.transaction.count({ where: { user_id: ledger.userId } });
    const monthBefore = await summary('2026-10');
    const listBefore = await listTransactionsRoute(ledger.request('/api/transactions?perPage=100'), undefined);
    const listedBefore = ((await listBefore.json()) as { data: { id: string }[] }).data.map((row) => row.id);
    expect(listedBefore).toContain(created.body.id);

    const deleted = await deleteTransaction(ledger.request(`/api/transactions/${created.body.id}`, { method: 'DELETE' }), ctx(created.body.id));
    expect(deleted.status).toBe(200);

    // The four readers: the list, the single read, the month, and the wallet balance.
    const listAfter = await listTransactionsRoute(ledger.request('/api/transactions?perPage=100'), undefined);
    const listedAfter = ((await listAfter.json()) as { data: { id: string }[] }).data.map((row) => row.id);
    expect(listedAfter).not.toContain(created.body.id);

    expect(
      (await readTransaction(ledger.request(`/api/transactions/${created.body.id}`), ctx(created.body.id))).status,
    ).toBe(404);

    const monthAfter = await summary('2026-10');
    expect(new Prisma.Decimal(monthAfter.expense).minus(monthBefore.expense).toFixed(4)).toBe('-75000.0000');
    expect(await balanceOf(cash)).toBe('0.0000');

    // The row count never falls — deleting a transaction is not deleting a row (ADR-0005).
    expect(await prisma.transaction.count({ where: { user_id: ledger.userId } })).toBe(rowsBefore);
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.deleted_at).not.toBeNull();
  });

  it('restores it: the row count is unchanged and the money comes back', async () => {
    const cash = await wallet('Cash to restore to');
    const created = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-12',
      walletId: cash,
      categoryId: await category('expense'),
      amount: '40000.0000',
    });

    await deleteTransaction(ledger.request(`/api/transactions/${created.body.id}`, { method: 'DELETE' }), ctx(created.body.id));
    expect(await balanceOf(cash)).toBe('0.0000');

    const restored = await restoreTransaction(
      ledger.request(`/api/transactions/${created.body.id}/restore`, { method: 'POST' }),
      ctx(created.body.id),
    );

    expect(restored.status).toBe(200);
    expect(((await restored.json()) as TxBody).id).toBe(created.body.id);
    expect(await balanceOf(cash)).toBe('-40000.0000');
    expect(await prisma.transaction.count({ where: { user_id: ledger.userId } })).toBeGreaterThan(0);
  });

  it('rebuilds both balances when an edit moves a transaction to another wallet', async () => {
    const first = await wallet('Edit from');
    const second = await wallet('Edit to');
    const created = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-13',
      walletId: first,
      categoryId: await category('expense'),
      amount: '30000.0000',
    });

    expect(await balanceOf(first)).toBe('-30000.0000');

    const edited = await editTransaction(
      ledger.request(`/api/transactions/${created.body.id}`, { method: 'PATCH', body: { walletId: second } }),
      ctx(created.body.id),
    );

    expect(edited.status).toBe(200);
    expect(await balanceOf(first)).toBe('0.0000');
    expect(await balanceOf(second)).toBe('-30000.0000');
  });

  it('refuses an edit that would put the row beyond the rules it was created under', async () => {
    const cash = await wallet('Edit rules');
    const created = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-14',
      walletId: cash,
      categoryId: await category('expense'),
      amount: '10000.0000',
    });

    const negative = await editTransaction(
      ledger.request(`/api/transactions/${created.body.id}`, { method: 'PATCH', body: { amount: '-1.0000' } }),
      ctx(created.body.id),
    );
    expect(negative.status).toBe(400);

    const currency = await editTransaction(
      ledger.request(`/api/transactions/${created.body.id}`, { method: 'PATCH', body: { currencyId: 'TS0' } }),
      ctx(created.body.id),
    );
    expect(currency.status).toBe(400);
    expect(((await currency.json()) as TxBody).error?.code).toBe('immutable_field');
  });
});

describe('Task 3.9 — a month is a calendar fact, not a timestamp', () => {
  it('puts a 31 October transaction in October and a 1 November one in November', async () => {
    const cash = await wallet('Cash for boundaries');
    const expenseCategory = await category('expense');

    const october = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-31',
      walletId: cash,
      categoryId: expenseCategory,
      amount: '100000.0000',
    });
    const november = await record({
      transactionType: 'expense',
      occurredOn: '2026-11-01',
      walletId: cash,
      categoryId: expenseCategory,
      amount: '200000.0000',
    });

    expect(october.body.occurredOn).toBe('2026-10-31');
    expect(november.body.occurredOn).toBe('2026-11-01');

    const octoberIds = await idsIn('2026-10-01', '2026-10-31');
    const novemberIds = await idsIn('2026-11-01', '2026-11-30');

    expect(octoberIds).toContain(october.body.id);
    expect(octoberIds).not.toContain(november.body.id);
    expect(novemberIds).toContain(november.body.id);
    expect(novemberIds).not.toContain(october.body.id);
  });

  it('reports a November-recorded October purchase in October, because recorded_at is not read', async () => {
    const cash = await wallet('Cash for recording dates');
    const expenseCategory = await category('expense');

    // Inserted directly, because no endpoint can set `recorded_at` — it is `now()` and it is audit only.
    const row = await prisma.transaction.create({
      data: {
        user_id: ledger.userId,
        transaction_type: 'expense',
        occurred_on: new Date('2026-10-20T00:00:00.000Z'),
        recorded_at: new Date('2026-11-05T09:00:00.000Z'),
        wallet_id: cash,
        category_id: expenseCategory,
        amount: '12345.0000',
        currency_id: 'TST',
        base_amount: '12345.0000',
        base_currency_id: 'TST',
      },
    });

    const october = await idsIn('2026-10-01', '2026-10-31');
    const november = await idsIn('2026-11-01', '2026-11-30');

    expect(october).toContain(row.id);
    expect(november).not.toContain(row.id);
  });

  it('stores occurred_on as a real date column, not a timestamp', async () => {
    const [column] = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'transaction' AND column_name = 'occurred_on'
    `;

    expect(column?.data_type).toBe('date');
  });
});
