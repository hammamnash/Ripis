import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as categoryBreakdownRoute } from '../app/api/reports/category-breakdown/route';
import { GET as trendsRoute } from '../app/api/reports/trends/route';
import { POST as createCategory } from '../app/api/categories/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { DELETE as deleteTransaction } from '../app/api/transactions/[id]/route';
import { POST as restoreTransaction } from '../app/api/transactions/[id]/restore/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 4.3 — the four breakdowns (FR-11, §8), against the endpoints the dashboard calls.
 *
 * The claims worth a spec here are the ones a plausible-looking implementation would get wrong:
 *
 * 1. **A ranking is a claim about the whole period, not about the rows a page happened to send.** `rows`
 *    comes back complete, `other` is the tail beyond the six a ranked chart draws, and the two add to the
 *    `total` the same query computed. A truncated top six with no tail would still look right (§4, ADR-0031).
 * 2. **Expense and income are two questions, and a row answers exactly one of them.** `kind=expense` must not
 *    quietly include an income row, or the chart and the month's totals would disagree.
 * 3. **A period with no transactions is a zero, not a gap.** A trend built from the rows alone would connect
 *    1 October to the 3rd and imply spending that never happened, so the series is walked from the window.
 * 4. **The comparison is against the period of the same length before this one**, and it says `null` rather
 *    than `0%` when there was nothing before it to compare with.
 * 5. **A soft-deleted row is in no figure** (ADR-0005) — asserted by removing one and putting it back.
 */
const EMAIL = 'phase-4-breakdowns@ripis.test';

/** October and September 2026, the two months every figure below is about. */
const OCTOBER = {
  expense: '1850000.0000',
  income: '2000000.0000',
  net: '150000.0000',
  counts: { income: 1, expense: 3 },
};
const SEPTEMBER = { expense: '100000.0000', income: '500000.0000', net: '400000.0000' };

let ledger: SpecLedger;
let cash: string;
let groceries: string;
let salary: string;
let rent: string;
let rentRow: string;

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

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

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

interface Row {
  categoryId: string | null;
  name: string;
  total: string;
  count: number;
  share: string;
}

async function breakdown(query: string): Promise<{
  status: number;
  data: {
    kind: string;
    currency: string;
    from: string;
    to: string;
    total: string;
    count: number;
    categories: number;
    rows: Row[];
    other: { total: string; count: number; categories: number; share: string } | null;
    comparison: { current: string; previous: string; change: string; changePercent: string | null; direction: string };
  };
  error: { code: string; field?: string };
}> {
  const response = await categoryBreakdownRoute(
    ledger.request(`/api/reports/category-breakdown?${query}`),
    undefined,
  );

  return { status: response.status, ...((await response.json()) as object) } as never;
}

async function trend(query: string): Promise<{
  status: number;
  data: {
    metric: string;
    granularity: string;
    from: string;
    to: string;
    points: { period: string; income: string; expense: string; net: string }[];
    totals: { income: string; expense: string; net: string; counts: { income: number; expense: number } };
    comparison: { metric: string; current: string; previous: string; change: string; changePercent: string | null; direction: string };
  };
  error: { code: string; field?: string };
}> {
  const response = await trendsRoute(ledger.request(`/api/reports/trends?${query}`), undefined);

  return { status: response.status, ...((await response.json()) as object) } as never;
}

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
  cash = await wallet('Breakdown cash');

  groceries = await category('expense', 'Groceries');
  rent = await category('expense', 'Rent');
  salary = await category('income', 'Salary');
  const fuel = await category('expense', 'Fuel');

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
  rentRow = await record({
    transactionType: 'expense',
    occurredOn: '2026-10-15',
    walletId: cash,
    categoryId: rent,
    amount: '1500000.0000',
  });
  await record({
    transactionType: 'expense',
    occurredOn: '2026-10-20',
    walletId: cash,
    categoryId: fuel,
    amount: '100000.0000',
  });

  // Deleted, and left deleted: a row that is in the ledger but in no figure (ADR-0005). If any total below
  // had included it, it would be wrong by 999,999 in a way no assertion would need to name.
  const mistake = await record({
    transactionType: 'expense',
    occurredOn: '2026-10-25',
    walletId: cash,
    categoryId: groceries,
    amount: '999999.0000',
  });
  await deleteTransaction(ledger.request(`/api/transactions/${mistake}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id: mistake }),
  });

  // September, which is what every comparison in this file is against.
  await record({
    transactionType: 'income',
    occurredOn: '2026-09-05',
    walletId: cash,
    categoryId: salary,
    amount: SEPTEMBER.income,
  });
  await record({
    transactionType: 'expense',
    occurredOn: '2026-09-30',
    walletId: cash,
    categoryId: groceries,
    amount: SEPTEMBER.expense,
  });

  // November, where the ranking has a tail to fold: eight categories, descending, so the top six are
  // recognisable and the last two are the `other` aggregate.
  const tiers = ['8000', '7000', '6000', '5000', '4000', '3000', '2000', '1000'];

  for (const [index, amount] of tiers.entries()) {
    await record({
      transactionType: 'expense',
      occurredOn: '2026-11-05',
      walletId: cash,
      categoryId: await category('expense', `Tier ${index + 1}`),
      amount: `${amount}.0000`,
    });
  }
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
});

describe('Task 4.3 — spending and earning by category', () => {
  it('ranks expense by category largest first, with the shares of the whole period', async () => {
    const reply = await breakdown('kind=expense&month=2026-10');

    expect(reply.status).toBe(200);
    expect(reply.data).toMatchObject({
      kind: 'expense',
      currency: 'TST',
      from: '2026-10-01',
      to: '2026-10-31',
      total: OCTOBER.expense,
      count: 3,
      categories: 3,
    });
    expect(reply.data.rows.map((row) => [row.name, row.total, row.share])).toEqual([
      ['Rent', '1500000.0000', '81.1'],
      ['Groceries', '250000.0000', '13.5'],
      ['Fuel', '100000.0000', '5.4'],
    ]);
    expect(reply.data.rows.map((row) => row.count)).toEqual([1, 1, 1]);
    // Nothing to fold: a tail that does not exist is `null` rather than a zero-valued object a chart would
    // have to know to skip.
    expect(reply.data.other).toBeNull();
  });

  it('answers the other question for an income breakdown, out of the same rows', async () => {
    const reply = await breakdown('kind=income&month=2026-10');

    expect(reply.data.total).toBe(OCTOBER.income);
    expect(reply.data.count).toBe(1);
    expect(reply.data.rows.map((row) => [row.name, row.total, row.share])).toEqual([
      ['Salary', '2000000.0000', '100.0'],
    ]);
  });

  it('sends the full ranking plus the other aggregate rather than a truncated top six', async () => {
    const reply = await breakdown('kind=expense&month=2026-11');

    expect(reply.data.categories).toBe(8);
    expect(reply.data.rows).toHaveLength(8);
    expect(reply.data.rows[0]?.total).toBe('8000.0000');
    expect(reply.data.rows[5]?.total).toBe('3000.0000');
    expect(reply.data.other).toEqual({ total: '3000.0000', count: 2, categories: 2, share: '8.3' });

    // The claim that makes `other` safe to draw: the bars plus the tail are the period, exactly.
    const bars = reply.data.rows.slice(0, 6).reduce((sum, row) => sum + Number(row.total), 0);
    const folded = Number(reply.data.other?.total);
    expect(bars + folded).toBe(Number(reply.data.total));
  });

  it('compares the period with the one before it, and says which way it moved', async () => {
    const expense = await breakdown('kind=expense&month=2026-10');

    expect(expense.data.comparison).toEqual({
      current: OCTOBER.expense,
      previous: SEPTEMBER.expense,
      change: '1750000.0000',
      changePercent: '1750.0',
      direction: 'up',
    });

    const income = await breakdown('kind=income&month=2026-10');

    expect(income.data.comparison).toMatchObject({ previous: SEPTEMBER.income, direction: 'up' });
  });

  it('refuses an unknown kind, and one that is missing', async () => {
    const unknown = await breakdown('kind=transfer&month=2026-10');

    expect(unknown.status).toBe(400);
    expect(unknown.error).toMatchObject({ code: 'validation_failed', field: 'kind' });

    const missing = await breakdown('month=2026-10');

    expect(missing.status).toBe(400);
    expect(missing.error).toMatchObject({ code: 'validation_failed', field: 'kind' });
  });
});

describe('Task 4.3 — a trend over the window', () => {
  it('walks the window by day, so a day with nothing in it is a zero rather than a gap', async () => {
    const reply = await trend('metric=expense&month=2026-10');

    expect(reply.status).toBe(200);
    expect(reply.data.granularity).toBe('day');
    expect(reply.data.points).toHaveLength(31);
    expect(reply.data.points[0]).toEqual({
      period: '2026-10-01',
      income: OCTOBER.income,
      expense: '0.0000',
      net: OCTOBER.income,
    });
    // 2 October has no rows and is still a point, at zero.
    expect(reply.data.points[1]).toEqual({
      period: '2026-10-02',
      income: '0.0000',
      expense: '0.0000',
      net: '0.0000',
    });
    expect(reply.data.points[2]?.expense).toBe('250000.0000');
    expect(reply.data.points[30]?.period).toBe('2026-10-31');
  });

  it('agrees with the period totals rather than summing its own points a second way', async () => {
    const reply = await trend('metric=expense&month=2026-10');

    expect(reply.data.totals).toEqual({
      income: OCTOBER.income,
      expense: OCTOBER.expense,
      net: OCTOBER.net,
      counts: OCTOBER.counts,
    });

    const summed = reply.data.points.reduce((sum, point) => sum + Number(point.expense), 0);
    expect(`${summed.toFixed(4)}`).toBe(OCTOBER.expense);
  });

  it('compares an expense trend on expense and a cash-flow trend on net, and names which', async () => {
    const expense = await trend('metric=expense&month=2026-10');

    expect(expense.data.comparison).toEqual({
      metric: 'expense',
      current: OCTOBER.expense,
      previous: SEPTEMBER.expense,
      change: '1750000.0000',
      changePercent: '1750.0',
      direction: 'up',
    });

    const cashFlow = await trend('metric=cash-flow&month=2026-10');

    expect(cashFlow.data.comparison).toEqual({
      metric: 'net',
      current: OCTOBER.net,
      previous: SEPTEMBER.net,
      change: '-250000.0000',
      changePercent: '-62.5',
      direction: 'down',
    });
  });

  it('buckets a range by month, and says nothing was before it when there was nothing', async () => {
    const reply = await trend('metric=expense&from=2026-09-01&to=2026-10-31');

    expect(reply.data.granularity).toBe('month');
    expect(reply.data.points.map((point) => point.period)).toEqual(['2026-09-01', '2026-10-01']);
    expect(reply.data.points[0]?.expense).toBe(SEPTEMBER.expense);
    expect(reply.data.points[1]?.expense).toBe(OCTOBER.expense);

    // The window this one follows is July–August, which holds no rows at all: `0%` would be a claim, and
    // `null` is the answer.
    expect(reply.data.comparison).toMatchObject({ previous: '0.0000', changePercent: null, direction: 'up' });
  });

  it('refuses an unknown metric, a missing one, and a day series over more than a quarter', async () => {
    const unknown = await trend('metric=net-worth&month=2026-10');

    expect(unknown.status).toBe(400);
    expect(unknown.error).toMatchObject({ code: 'validation_failed', field: 'metric' });

    const missing = await trend('month=2026-10');

    expect(missing.status).toBe(400);
    expect(missing.error).toMatchObject({ code: 'validation_failed', field: 'metric' });

    const tooLong = await trend('metric=expense&from=2026-01-01&to=2026-12-31&granularity=day');

    expect(tooLong.status).toBe(400);
    expect(tooLong.error).toMatchObject({ code: 'validation_failed', field: 'granularity' });
  });
});

describe('Task 4.3 — a removed row leaves every figure (ADR-0005)', () => {
  it('drops the row out of the ranking and the series, and puts it back when restored', async () => {
    const before = await breakdown('kind=expense&month=2026-10');
    const seriesBefore = await trend('metric=expense&month=2026-10');

    await deleteTransaction(ledger.request(`/api/transactions/${rentRow}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: rentRow }),
    });

    const removed = await breakdown('kind=expense&month=2026-10');
    const seriesRemoved = await trend('metric=expense&month=2026-10');

    expect(removed.data.total).toBe('350000.0000');
    expect(removed.data.categories).toBe(2);
    expect(removed.data.rows[0]?.name).toBe('Groceries');
    expect(seriesRemoved.data.totals.expense).toBe('350000.0000');

    await restoreTransaction(ledger.request(`/api/transactions/${rentRow}/restore`, { method: 'POST' }), {
      params: Promise.resolve({ id: rentRow }),
    });

    const restored = await breakdown('kind=expense&month=2026-10');
    const seriesRestored = await trend('metric=expense&month=2026-10');

    expect(restored.data).toEqual(before.data);
    expect(seriesRestored.data).toEqual(seriesBefore.data);
  });
});
