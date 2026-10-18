import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as monthlySummary } from '../app/api/reports/monthly-summary/route';
import { POST as createCategory } from '../app/api/categories/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { DELETE as deleteTransaction } from '../app/api/transactions/[id]/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 4.1 — a period's income, expense and net, through the endpoint the dashboard calls (FR-11).
 *
 * Four claims, each of which is a way the figure could be wrong rather than a restatement of the code:
 *
 * 1. **The window is the days the caller asked for, inclusively.** `?from=2026-10-03&to=2026-10-03` is one
 *    day, not none — the half-open bound is widened inside `filter.ts` and the wire names the last day
 *    counted, which is the day a screen said.
 * 2. **A transfer is in neither total.** There is no "exclude transfers" clause anywhere; the query counts
 *    two types, so the assertion is that adding a transfer between the user's own wallets moves no figure.
 * 3. **A soft-deleted row is in neither the total nor the count** (ADR-0005). It is in the fixture, deleted,
 *    exactly as a user would leave it.
 * 4. **Every amount leaves as a string.** `net` is the only derived figure in the reply and it is money
 *    arithmetic in `Decimal`, not a float that happened to print well (ADR-0012).
 */
const EMAIL = 'phase-4-reports@ripis.test';

let ledger: SpecLedger;
let cash: string;
let savings: string;
let groceries: string;
let salary: string;
let rent: string;

/** The October 2026 ledger every assertion below is about. */
const OCTOBER = {
  income: '2000000.0000',
  expense: '1750000.0000',
  net: '250000.0000',
  counts: { income: 1, expense: 2 },
};

async function wallet(name: string): Promise<string> {
  const response = await createWallet(
    ledger.request('/api/wallets', {
      method: 'POST',
      body: { name, walletType: 'cash', currencyId: 'TST', openingBalance: '0.0000' },
    }),
    undefined,
  );

  return ((await response.json()) as { id: string }).id;
}

async function category(type: 'income' | 'expense', name: string): Promise<string> {
  const response = await createCategory(
    ledger.request('/api/categories', { method: 'POST', body: { name, type, color: '#D22129' } }),
    undefined,
  );

  return ((await response.json()) as { id: string }).id;
}

async function record(body: Record<string, unknown>): Promise<string> {
  const response = await createTransaction(
    ledger.request('/api/transactions', { method: 'POST', body }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

  return ((await response.json()) as { id: string }).id;
}

/** The reply, as the endpoint produced it — a screen reaches these figures through exactly this URL. */
async function summary(query: string): Promise<{
  status: number;
  data: {
    from: string;
    to: string;
    month: string | null;
    currency: string;
    income: string;
    expense: string;
    net: string;
    counts: { income: number; expense: number };
  };
  error: { code: string; field?: string };
}> {
  const response = await monthlySummary(ledger.request(`/api/reports/monthly-summary?${query}`), undefined);

  return { status: response.status, ...((await response.json()) as object) } as never;
}

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);

  cash = await wallet('Dashboard cash');
  savings = await wallet('Dashboard savings');
  groceries = await category('expense', 'Groceries');
  rent = await category('expense', 'Rent');
  salary = await category('income', 'Salary');

  await record({
    transactionType: 'income',
    occurredOn: '2026-10-01',
    walletId: cash,
    categoryId: salary,
    amount: OCTOBER.income,
  });
  await record({
    transactionType: 'expense',
    occurredOn: '2026-10-03',
    walletId: cash,
    categoryId: groceries,
    amount: '250000.0000',
  });
  await record({
    transactionType: 'expense',
    occurredOn: '2026-10-15',
    walletId: cash,
    categoryId: rent,
    amount: '1500000.0000',
  });
  await record({
    transactionType: 'transfer',
    occurredOn: '2026-10-20',
    walletId: cash,
    destinationWalletId: savings,
    amount: '100000.0000',
  });

  // Deleted, and it stays deleted: the row is still in the ledger with a `deleted_at`, and October must
  // stop counting it even though nothing about the row's amounts changed (ADR-0005).
  const mistake = await record({
    transactionType: 'expense',
    occurredOn: '2026-10-25',
    walletId: cash,
    categoryId: groceries,
    amount: '99999.0000',
  });
  await deleteTransaction(ledger.request(`/api/transactions/${mistake}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: mistake }),
  });

  // September, so that the window itself is being tested and not just the arithmetic.
  await record({
    transactionType: 'expense',
    occurredOn: '2026-09-30',
    walletId: cash,
    categoryId: groceries,
    amount: '7000.0000',
  });
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
});

describe('Task 4.1 — a period summary', () => {
  it('sums income, expense and net over the month it was asked for', async () => {
    const reply = await summary('month=2026-10');

    expect(reply.status).toBe(200);
    expect(reply.data).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      month: '2026-10-01',
      currency: 'TST',
      income: OCTOBER.income,
      expense: OCTOBER.expense,
      net: OCTOBER.net,
      counts: OCTOBER.counts,
    });
  });

  it('sends every amount as a string, and derives net in decimal arithmetic', async () => {
    const reply = await summary('month=2026-10');

    for (const figure of [reply.data.income, reply.data.expense, reply.data.net]) {
      expect(typeof figure).toBe('string');
    }

    // The one derived figure in the reply: 2,000,000 − 1,750,000, computed by `Decimal.minus`.
    expect(reply.data.net).toBe('250000.0000');
  });

  it('counts a range inclusively of both days it names', async () => {
    const day = await summary('from=2026-10-03&to=2026-10-03');

    expect(day.status).toBe(200);
    expect(day.data.from).toBe('2026-10-03');
    expect(day.data.to).toBe('2026-10-03');
    // A single day is not a month, so there is no label for a screen to print as if it were.
    expect(day.data.month).toBeNull();
    expect(day.data.expense).toBe('250000.0000');
    expect(day.data.counts).toEqual({ income: 0, expense: 1 });
  });

  it('reads a range that spans a month boundary as the days between', async () => {
    const spanned = await summary('from=2026-09-30&to=2026-10-03');

    // September's 7,000 and October's first expense, and nothing from between them.
    expect(spanned.data.expense).toBe('257000.0000');
    expect(spanned.data.counts.expense).toBe(2);
    expect(spanned.data.month).toBeNull();
  });

  it('reports a different period differently, so the window is being read and not the whole ledger', async () => {
    const september = await summary('month=2026-09');

    expect(september.data).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      month: '2026-09-01',
      income: '0.0000',
      expense: '7000.0000',
      net: '-7000.0000',
      counts: { income: 0, expense: 1 },
    });
  });

  it('moves no figure when money is transferred between the user’s own wallets', async () => {
    const before = await summary('month=2026-10');

    await record({
      transactionType: 'transfer',
      occurredOn: '2026-10-28',
      walletId: cash,
      destinationWalletId: savings,
      amount: '500000.0000',
    });

    const after = await summary('month=2026-10');

    expect(after.data).toEqual(before.data);
  });

  it('refuses a report with no period, and a period given twice', async () => {
    const nothing = await summary('');

    expect(nothing.status).toBe(400);
    expect(nothing.error).toMatchObject({ code: 'validation_failed', field: 'month' });

    const both = await summary('month=2026-10&from=2026-10-01');

    expect(both.status).toBe(400);
    expect(both.error).toMatchObject({ code: 'validation_failed', field: 'month' });

    const half = await summary('from=2026-10-05');

    expect(half.status).toBe(400);
    expect(half.error).toMatchObject({ code: 'validation_failed', field: 'to' });

    const backwards = await summary('from=2026-11-01&to=2026-10-01');

    expect(backwards.status).toBe(400);
    expect(backwards.error).toMatchObject({ code: 'validation_failed', field: 'to' });
  });

  it('is not readable without an account', async () => {
    const anonymous = await monthlySummary(
      new Request('http://spec.local/api/reports/monthly-summary?month=2026-10'),
      undefined,
    );

    expect(anonymous.status).toBe(401);
  });
});
