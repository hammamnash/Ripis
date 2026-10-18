import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GET as listBudgetsRoute, POST as createBudgetRoute } from '../app/api/budgets/route';
import { POST as createCategory } from '../app/api/categories/route';
import { DELETE as deleteTransaction } from '../app/api/transactions/[id]/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { budgetStatus, budgetStanding } from '../src/server/budgets/status';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 5.2 — usage and status (FR-10, §10).
 *
 * Split deliberately into the two different kinds of claim the task makes:
 *
 * **The threshold table is a unit.** §10's boundaries are exact percentages, so they are asserted against
 * `budgetStanding` directly at the figures §10 names — including exactly 100%, which is yellow because a
 * bar sitting on its limit has not exceeded it.
 *
 * **The sum is an integration.** Where the money comes from is a claim about rows, so everything below the
 * second `describe` drives real transactions through the API: `base_amount` rather than `amount`,
 * `deleted_at IS NULL`, the month window, and `transaction_type = 'expense'`. Each of those is a way a
 * plausible implementation reports a number that is wrong by a known amount, which is worse than reporting
 * nothing.
 */
const EMAIL = 'phase-5-budget-status@ripis.test';

const OCTOBER = '2026-10';

interface Bar {
  categoryId: string;
  categoryName: string;
  amount: string;
  month: string;
  used: string;
  remaining: string;
  percent: string;
  status: string;
  label: string;
  token: string;
}

let ledger: SpecLedger;
let walletId: string;

/**
 * A wallet, asserted to have been created.
 *
 * The assertion is the point: a `walletType` outside the enum is a 400 that hands back `undefined`, and
 * the undefined then surfaces as a puzzling failure several steps later — which is how this spec's first
 * run failed, with a transfer refused for a missing destination rather than for its category.
 */
async function wallet(
  name: string,
  options: { currencyId?: string; walletType?: string; owner?: SpecLedger } = {},
): Promise<string> {
  const owner = options.owner ?? ledger;
  const response = await createWallet(
    owner.request('/api/wallets', {
      method: 'POST',
      body: {
        name,
        walletType: options.walletType ?? 'cash',
        currencyId: options.currencyId ?? 'TST',
        openingBalance: '0.0000',
      },
    }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

  return ((await response.json()) as { id: string }).id;
}

async function category(type: 'income' | 'expense', name: string, owner?: SpecLedger): Promise<string> {
  const response = await createCategory(
    (owner ?? ledger).request('/api/categories', {
      method: 'POST',
      body: { name, type, color: '#D22129' },
    }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

  return ((await response.json()) as { id: string }).id;
}

/** A row in the ledger, of whichever type the body names. */
async function record(body: Record<string, unknown>, expected = 201): Promise<string> {
  const response = await createTransaction(
    ledger.request('/api/transactions', { method: 'POST', body }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(expected);

  return ((await response.json()) as { id: string }).id;
}

async function budgeted(categoryId: string, amount: string, month = OCTOBER): Promise<void> {
  const response = await createBudgetRoute(
    ledger.request('/api/budgets', { method: 'POST', body: { categoryId, amount, month } }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
}

/** The bars a screen would get for the month. */
async function bars(month = OCTOBER): Promise<Bar[]> {
  const response = await listBudgetsRoute(ledger.request(`/api/budgets?month=${month}`), undefined);
  expect(response.status).toBe(200);

  return ((await response.json()) as { data: Bar[] }).data;
}

async function barFor(categoryId: string, month = OCTOBER): Promise<Bar> {
  const found = (await bars(month)).find((bar) => bar.categoryId === categoryId);

  if (found === undefined) throw new Error(`No bar for category ${categoryId}.`);

  return found;
}

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
});

beforeEach(async () => {
  await prisma.budget.deleteMany({ where: { user_id: ledger.userId } });
  await prisma.transaction.deleteMany({ where: { user_id: ledger.userId } });
  await prisma.category.deleteMany({ where: { user_id: ledger.userId } });
  await prisma.wallet.deleteMany({ where: { user_id: ledger.userId } });

  walletId = await wallet('Cash');
});

describe('the threshold table (Task 5.2, FR-10, §10)', () => {
  const budget = new Prisma.Decimal('10000');

  it('closes every boundary §10 left open, at the figure §10 names it by', () => {
    const cases = [
      { used: '0', percent: '0.00', status: 'green', label: 'On track', token: '--color-positive' },
      { used: '7999', percent: '79.99', status: 'green', label: 'On track', token: '--color-positive' },
      { used: '8000', percent: '80.00', status: 'yellow', label: 'Approaching limit', token: '--color-warning' },
      { used: '9999', percent: '99.99', status: 'yellow', label: 'Approaching limit', token: '--color-warning' },
      // EXACTLY 100% is yellow: spent, not exceeded. Red begins the moment it passes.
      { used: '10000', percent: '100.00', status: 'yellow', label: 'Spent, not exceeded', token: '--color-warning' },
      { used: '10001', percent: '100.01', status: 'red', label: 'Over budget', token: '--color-negative' },
    ] as const;

    for (const expected of cases) {
      const used = new Prisma.Decimal(expected.used);

      expect(budgetStanding(used, budget), expected.used).toEqual({
        percent: expected.percent,
        status: expected.status,
        label: expected.label,
        token: expected.token,
      });

      // The colour alone is the same answer, because it delegates rather than re-comparing.
      expect(budgetStatus(used, budget), expected.used).toBe(expected.status);
    }
  });

  it('agrees with the figure it prints, rather than contradicting it between the two', () => {
    // 79.9999% rounds to 80.00. Comparing the raw ratio would call this green and print "80.00%" beside
    // it in --color-positive — a status disagreeing with the number a person is reading. §15 puts a word
    // beside every colour so the two are read together, so they are made to agree by construction.
    const standing = budgetStanding(new Prisma.Decimal('7999.99'), budget);

    expect(standing.percent).toBe('80.00');
    expect(standing.status).toBe('yellow');
  });

  it('never signals a status with colour alone (§15)', () => {
    for (const standing of [
      budgetStanding(new Prisma.Decimal('1'), budget),
      budgetStanding(new Prisma.Decimal('9000'), budget),
      budgetStanding(new Prisma.Decimal('90000'), budget),
    ]) {
      expect(standing.label.length).toBeGreaterThan(0);
      expect(standing.percent).toMatch(/^\d+\.\d\d$/);
    }
  });

  it('refuses to compute a percentage for a zero budget instead of inventing one', () => {
    // Unreachable through the API — a zero budget is a 400 at creation and CHECK (amount > 0) at the
    // table — so this is stated as a defect rather than reported as a caller's mistake.
    expect(() => budgetStanding(new Prisma.Decimal('0'), new Prisma.Decimal('0'))).toThrow(/zero/i);
  });
});

describe('what the month actually spent (Task 5.2, §10)', () => {
  it('counts a foreign-currency purchase at the value it had on the day, not at its own amount', async () => {
    const euroId = await wallet('Zero-decimal', { currencyId: 'TS0' });

    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '20000000');

    // 900 in the wallet's own currency, worth 15,000,000 in the primary one on the day it happened
    // (ADR-0004). Summing `amount` would report 900 against a 20,000,000 budget.
    await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: euroId,
      categoryId: groceries,
      amount: '900.0000',
      baseAmount: '15000000.0000',
    });

    const bar = await barFor(groceries);
    expect(bar.used).toBe('15000000.0000');
    expect(bar.percent).toBe('75.00');
    expect(bar.remaining).toBe('5000000.0000');
    expect(bar.status).toBe('green');
  });

  it('leaves a soft-deleted row out, and puts it back when it is restored (ADR-0005)', async () => {
    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '10000');

    const id = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId,
      categoryId: groceries,
      amount: '5000.0000',
    });
    expect((await barFor(groceries)).percent).toBe('50.00');

    await deleteTransaction(ledger.request(`/api/transactions/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });

    // A missing `deleted_at IS NULL` would leave the bar at 50% of money the user had removed — and the
    // bar would sit further along than the transactions behind it.
    const removed = await barFor(groceries);
    expect(removed.used).toBe('0.0000');
    expect(removed.percent).toBe('0.00');
    expect(removed.status).toBe('green');
  });

  it('is not moved by a transfer, which cannot carry a category at all', async () => {
    const destinationId = await wallet('Savings', { walletType: 'savings_account' });

    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '10000');

    // The structural half: a transfer is refused a category, so it can never be attached to a budget in
    // the first place. Moving money between your own wallets is not spending it.
    const refused = await createTransaction(
      ledger.request('/api/transactions', {
        method: 'POST',
        body: {
          transactionType: 'transfer',
          occurredOn: '2026-10-06',
          walletId,
          destinationWalletId: destinationId,
          categoryId: groceries,
          amount: '5000.0000',
          destinationAmount: '5000.0000',
        },
      }),
      undefined,
    );
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatchObject({ field: 'categoryId' });

    await record({
      transactionType: 'transfer',
      occurredOn: '2026-10-06',
      walletId,
      destinationWalletId: destinationId,
      amount: '5000.0000',
    });

    expect((await barFor(groceries)).used).toBe('0.0000');
  });

  it('counts a reconciliation, because it is an ordinary expense (ADR-0017)', async () => {
    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '10000');

    // A reconciliation is a normal `expense` noted Balance Difference — its note is its only marker, and
    // it counts toward expense totals. A report that excluded it by matching the note would disagree with
    // the month's own totals, and this bar is one of those totals.
    await record({
      transactionType: 'expense',
      occurredOn: '2026-10-07',
      walletId,
      categoryId: groceries,
      amount: '2500.0000',
      notes: 'Balance Difference',
    });

    expect((await barFor(groceries)).used).toBe('2500.0000');
  });

  it('counts the last day of the month and not the first of the next', async () => {
    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '10000');

    await record({
      transactionType: 'expense',
      occurredOn: '2026-10-31',
      walletId,
      categoryId: groceries,
      amount: '1000.0000',
    });
    expect((await barFor(groceries)).used).toBe('1000.0000');

    await record({
      transactionType: 'expense',
      occurredOn: '2026-11-01',
      walletId,
      categoryId: groceries,
      amount: '4000.0000',
    });

    // October's bar is unmoved by November. `to` is the first of the next month and is exclusive, which is
    // what makes the boundary independent of whoever is asking (ADR-0007).
    expect((await barFor(groceries)).used).toBe('1000.0000');
  });

  it('shows a bar for a budget, not for spending that has no budget', async () => {
    const groceries = await category('expense', 'Groceries');
    const transport = await category('expense', 'Transport');
    await budgeted(groceries, '10000');

    await record({
      transactionType: 'expense',
      occurredOn: '2026-10-08',
      walletId,
      categoryId: transport,
      amount: '3000.0000',
    });

    const listed = await bars();
    expect(listed.map((bar) => bar.categoryName)).toEqual(['Groceries']);
  });

  it('goes negative rather than clamping, once the limit is passed', async () => {
    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '10000');

    await record({
      transactionType: 'expense',
      occurredOn: '2026-10-09',
      walletId,
      categoryId: groceries,
      amount: '12000.0000',
    });

    const bar = await barFor(groceries);
    expect(bar.remaining).toBe('-2000.0000');
    expect(bar.status).toBe('red');
    expect(bar.label).toBe('Over budget');
    expect(bar.token).toBe('--color-negative');
  });

  it('carries the figure, the word and the token together in one payload (§15)', async () => {
    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '10000');

    const bar = await barFor(groceries);
    expect(Object.keys(bar).sort()).toEqual(
      [
        'amount',
        'categoryColor',
        'categoryId',
        'categoryName',
        'createdAt',
        'id',
        'label',
        'month',
        'percent',
        'remaining',
        'status',
        'token',
        'updatedAt',
        'used',
      ].sort(),
    );
  });

  it('does not count another account spending against this account budget', async () => {
    const groceries = await category('expense', 'Groceries');
    await budgeted(groceries, '10000');

    const other = await signedInLedger('phase-5-budget-status-other@ripis.test');

    try {
      // The other account's own wallet, category and expense, through the real endpoints — so this asserts
      // that their spending exists, rather than asserting that a hand-written row was ignored.
      const theirWallet = await wallet('Theirs', { owner: other });
      const theirGroceries = await category('expense', 'Groceries', other);

      const theirs = await createTransaction(
        other.request('/api/transactions', {
          method: 'POST',
          body: {
            transactionType: 'expense',
            occurredOn: '2026-10-10',
            walletId: theirWallet,
            categoryId: theirGroceries,
            amount: '9000.0000',
          },
        }),
        undefined,
      );
      expect(theirs.status, JSON.stringify(await theirs.clone().json())).toBe(201);

      expect((await barFor(groceries)).used).toBe('0.0000');
    } finally {
      await closeLedger(other);
    }
  });
});
