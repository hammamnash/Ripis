import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as categoryBreakdownRoute } from '../app/api/reports/category-breakdown/route';
import { GET as monthlySummary } from '../app/api/reports/monthly-summary/route';
import { GET as trendsRoute } from '../app/api/reports/trends/route';
import { POST as createCategory } from '../app/api/categories/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 4.4 — the dashboard's filters, and the one bug they exist to prevent (§9, FR-07).
 *
 * The plan calls it "the classic bug": **a filtered list beside unfiltered totals.** It is not a wrong sum.
 * Every figure on the screen is right on its own — the list is narrowed, the totals are not, and the page
 * simply does not add up. So the assertion that matters is not that one endpoint honours one parameter; it
 * is that adding a filter moves *every* figure a screen would draw, across all three report endpoints, and
 * that they move **together**.
 *
 * Six narrowings are exercised here — the plan's five (`walletId`, `currencyId`, `categoryType`,
 * `transactionType`, and the window, which `report-summary.spec.ts` covers) plus `categoryId`, which §8
 * lists as the Category filter and the plan's list does not name. A filter that narrowed only the list
 * would pass every endpoint's own spec and fail this file.
 */
const EMAIL = 'phase-4-filters@ripis.test';

/** October 2026, unfiltered: the wide reading every narrowing below is compared against. */
const ALL = {
  income: '2300000.0000',
  expense: '1650000.0000',
  net: '650000.0000',
  counts: { income: 2, expense: 3 },
};

let ledger: SpecLedger;
let cash: string;
let savings: string;
let zeroDecimal: string;
let groceries: string;
let rent: string;
let salary: string;
let bonus: string;

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

async function category(type: 'income' | 'expense', name: string): Promise<string> {
  const response = await createCategory(
    ledger.request('/api/categories', { method: 'POST', body: { name, type, color: '#D22129' } }),
    undefined,
  );

  return ((await response.json()) as { id: string }).id;
}

async function record(body: Record<string, unknown>): Promise<void> {
  const response = await createTransaction(
    ledger.request('/api/transactions', { method: 'POST', body }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
}

/**
 * The four figures a dashboard draws, read from the three endpoints the way a screen reads them: the
 * summary's income and expense, the ranked total, and the trend's expense line. Every one of them is asked
 * over the same window with the same filters, which is the whole of Task 4.4's claim.
 */
async function figures(query: string): Promise<{
  income: string;
  expense: string;
  net: string;
  ranked: string;
  trended: string;
  trendedIncome: string;
}> {
  const request = (path: string, extra = '') => ledger.request(`/api/reports/${path}?${query}${extra}`, {});
  const [summaryResponse, breakdownResponse, trendResponse] = await Promise.all([
    monthlySummary(request('monthly-summary'), undefined),
    categoryBreakdownRoute(request('category-breakdown', '&kind=expense'), undefined),
    trendsRoute(request('trends', '&metric=expense'), undefined),
  ]);

  const summary = (await summaryResponse.json()) as { data: { income: string; expense: string; net: string } };
  const breakdown = (await breakdownResponse.json()) as { data: { total: string } };
  const trend = (await trendResponse.json()) as { data: { totals: { income: string; expense: string } } };

  return {
    income: summary.data.income,
    expense: summary.data.expense,
    net: summary.data.net,
    ranked: breakdown.data.total,
    trended: trend.data.totals.expense,
    trendedIncome: trend.data.totals.income,
  };
}

async function summary(query: string): Promise<{
  status: number;
  data: { income: string; expense: string; net: string; counts: { income: number; expense: number } };
  error: { code: string; field?: string };
}> {
  const response = await monthlySummary(ledger.request(`/api/reports/monthly-summary?${query}`), undefined);

  return { status: response.status, ...((await response.json()) as object) } as never;
}

async function breakdown(query: string): Promise<{
  status: number;
  data: { total: string; rows: { name: string; total: string }[]; categories: number; other: unknown };
  error: { code: string; field?: string };
}> {
  const response = await categoryBreakdownRoute(
    ledger.request(`/api/reports/category-breakdown?${query}`),
    undefined,
  );

  return { status: response.status, ...((await response.json()) as object) } as never;
}

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);

  cash = await wallet('Filter cash');
  savings = await wallet('Filter savings');
  zeroDecimal = await wallet('Filter zero-decimal', 'TS0');

  groceries = await category('expense', 'Groceries');
  rent = await category('expense', 'Rent');
  salary = await category('income', 'Salary');
  bonus = await category('income', 'Bonus');

  await record({
    transactionType: 'income',
    occurredOn: '2026-10-01',
    walletId: cash,
    categoryId: salary,
    amount: '2000000.0000',
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
    occurredOn: '2026-10-05',
    walletId: savings,
    categoryId: rent,
    amount: '1000000.0000',
  });
  await record({
    transactionType: 'income',
    occurredOn: '2026-10-07',
    walletId: savings,
    categoryId: bonus,
    amount: '300000.0000',
  });
  // A foreign wallet states its frozen base figure (ADR-0049): 5,000 TS0 is 400,000 of the primary
  // currency, and every total below is in the primary currency because that is what `base_amount` is.
  await record({
    transactionType: 'expense',
    occurredOn: '2026-10-09',
    walletId: zeroDecimal,
    categoryId: groceries,
    amount: '5000.0000',
    baseAmount: '400000.0000',
  });
  // A transfer, which touches two wallets and belongs to no total (ADR-0008).
  await record({
    transactionType: 'transfer',
    occurredOn: '2026-10-11',
    walletId: cash,
    destinationWalletId: savings,
    amount: '100000.0000',
  });
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
});

describe('Task 4.4 — every figure, not only the list', () => {
  it('reads the whole month with no filters at all', async () => {
    expect(await figures('month=2026-10')).toEqual({
      income: ALL.income,
      expense: ALL.expense,
      net: ALL.net,
      ranked: ALL.expense,
      trended: ALL.expense,
      trendedIncome: ALL.income,
    });
  });

  it('moves every figure when one filter is added, across all three endpoints', async () => {
    const wide = await figures('month=2026-10');
    const narrowed = await figures(`month=2026-10&walletId=${cash}`);

    // Both wallets hold income and expense, so this is a genuine narrowing of every figure — and if any one
    // of these six still equalled the wide reading, that endpoint would be the classic bug.
    expect(narrowed).not.toEqual(wide);
    expect(narrowed.income).toBe('2000000.0000');
    expect(narrowed.expense).toBe('250000.0000');
    expect(narrowed.net).toBe('1750000.0000');
    expect(narrowed.ranked).toBe('250000.0000');
    expect(narrowed.trended).toBe('250000.0000');
    expect(narrowed.trendedIncome).toBe('2000000.0000');
  });

  it('narrows by currency, in the primary currency, from a foreign wallet’s frozen base figure', async () => {
    const reply = await figures(`month=2026-10&currencyId=TS0`);

    expect(reply.income).toBe('0.0000');
    expect(reply.expense).toBe('400000.0000');
    expect(reply.ranked).toBe('400000.0000');
    expect(reply.trended).toBe('400000.0000');

    const ranked = await breakdown('kind=expense&month=2026-10&currencyId=TS0');

    expect(ranked.data.rows).toEqual([
      { categoryId: groceries, name: 'Groceries', color: '#D22129', total: '400000.0000', count: 1, share: '100.0' },
    ]);
  });

  it('narrows by the type of category, and by one category', async () => {
    const income = await summary('month=2026-10&categoryType=income');

    expect(income.data).toMatchObject({ income: ALL.income, expense: '0.0000', net: ALL.income });
    expect(income.data.counts).toEqual({ income: 2, expense: 0 });

    const one = await summary(`month=2026-10&categoryId=${rent}`);

    expect(one.data).toMatchObject({ income: '0.0000', expense: '1000000.0000', net: '-1000000.0000' });
  });

  it('narrows by transaction type, and a breakdown of the other type is a breakdown of nothing', async () => {
    const typed = await summary('month=2026-10&transactionType=income');

    expect(typed.data).toMatchObject({ income: ALL.income, expense: '0.0000', counts: { income: 2, expense: 0 } });

    // The kind is the breakdown's subject and the filter narrows it, so the two are intersected rather than
    // one quietly winning: nothing is both an expense and an income row.
    const contradictory = await breakdown('kind=expense&month=2026-10&categoryType=income');

    expect(contradictory.data).toMatchObject({ total: '0.0000', categories: 0, other: null });
    expect(contradictory.data.rows).toEqual([]);
  });

  it('answers with zeroes, not an error, when a filter matches nothing at all', async () => {
    const nowhere = await figures(`month=2026-10&walletId=00000000-0000-4000-8000-000000000000`);

    expect(nowhere).toEqual({
      income: '0.0000',
      expense: '0.0000',
      net: '0.0000',
      ranked: '0.0000',
      trended: '0.0000',
      trendedIncome: '0.0000',
    });
  });

  it('refuses a narrowing it does not recognise, naming the parameter', async () => {
    for (const [query, field] of [
      ['month=2026-10&walletId=', 'walletId'],
      ['month=2026-10&categoryType=transfer', 'categoryType'],
      ['month=2026-10&transactionType=adjustment', 'transactionType'],
      ['month=2026-10&granularity=week', 'granularity'],
    ] as const) {
      const refused = await summary(query);

      // An empty parameter is "not set" rather than a match-nothing id, so only the three bad names refuse.
      if (field === 'walletId') {
        expect(refused.status).toBe(200);

        continue;
      }

      expect(refused.status, query).toBe(400);
      expect(refused.error, query).toMatchObject({ code: 'validation_failed', field });
    }
  });
});
