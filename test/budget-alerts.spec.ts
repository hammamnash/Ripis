import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GET as listBudgetsRoute, POST as createBudgetRoute } from '../app/api/budgets/route';
import { GET as monthStatusRoute } from '../app/api/budgets/status/route';
import { POST as createCategory } from '../app/api/categories/route';
import { DELETE as deleteTransaction } from '../app/api/transactions/[id]/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 5.3 — alerts, in-app only, computed at open (FR-10, §10, ADR-0011, ADR-0018).
 *
 * The claim this spec exists for is that an alert is **not a thing that exists**. There is no alert table
 * and no alert state: `GET /budgets/status` reads the month's stored rows and answers, so an alert is
 * whatever the rows say at the moment it is asked for. Every test below is a consequence of that one
 * decision:
 *
 * 1. **An alert is the bar's own status, restated** — so its figures are equal to the bar's, not merely
 *    similar, and the two can never disagree about one budget.
 * 2. **The month's own colour cannot swallow an alert.** Overspending one budget and underspending another
 *    nets the month out, so a month can be green with a red category in it. Asserted, because deriving
 *    alerts from the month's status is the obvious mistake that looks right.
 * 3. **Changing a row changes the next answer**, with nothing in between — no queue, no job, no cache.
 * 4. **The alert path has no delivery mechanism in it at all.** Alerts cannot reach anybody while the app
 *    is closed, and that is stated as a limitation rather than hidden (ADR-0018); a spec that asserted
 *    otherwise would be asserting a feature nobody has built.
 */
const EMAIL = 'phase-5-budget-alerts@ripis.test';

const OCTOBER = '2026-10';

interface Bar {
  categoryId: string;
  categoryName: string;
  amount: string;
  used: string;
  remaining: string;
  percent: string;
  status: string;
  label: string;
  token: string;
}

interface MonthStatus {
  month: string;
  currency: string;
  budgets: number;
  totalBudget: string;
  totalUsed: string;
  totalRemaining: string;
  percent: string | null;
  status: string | null;
  label: string | null;
  token: string | null;
  threshold: number;
  alerts: Bar[];
}

let ledger: SpecLedger;
let walletId: string;

async function category(name: string): Promise<string> {
  const response = await createCategory(
    ledger.request('/api/categories', { method: 'POST', body: { name, type: 'expense', color: '#D22129' } }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

  return ((await response.json()) as { id: string }).id;
}

/** A budget plus the spending against it, in one step: `spent` of `amount` this month. */
async function budgetSpent(categoryId: string, amount: string, spent: string): Promise<void> {
  const created = await createBudgetRoute(
    ledger.request('/api/budgets', { method: 'POST', body: { categoryId, amount, month: OCTOBER } }),
    undefined,
  );
  expect(created.status, JSON.stringify(await created.clone().json())).toBe(201);

  if (spent === '0') return;

  const expense = await createTransaction(
    ledger.request('/api/transactions', {
      method: 'POST',
      body: {
        transactionType: 'expense',
        occurredOn: '2026-10-05',
        walletId,
        categoryId,
        amount: spent,
      },
    }),
    undefined,
  );
  expect(expense.status, JSON.stringify(await expense.clone().json())).toBe(201);
}

async function status(month = OCTOBER): Promise<MonthStatus> {
  const response = await monthStatusRoute(ledger.request(`/api/budgets/status?month=${month}`), undefined);

  expect(response.status).toBe(200);

  return (await response.json()) as MonthStatus;
}

async function bars(month = OCTOBER): Promise<Bar[]> {
  const response = await listBudgetsRoute(ledger.request(`/api/budgets?month=${month}`), undefined);

  return ((await response.json()) as { data: Bar[] }).data;
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

  const response = await createWallet(
    ledger.request('/api/wallets', {
      method: 'POST',
      body: { name: 'Cash', walletType: 'cash', currencyId: 'TST', openingBalance: '0.0000' },
    }),
    undefined,
  );
  walletId = ((await response.json()) as { id: string }).id;
});

describe('the month aggregate (Task 5.3, §10)', () => {
  it('sums the month and reports where a bar becomes an alert', async () => {
    await budgetSpent(await category('Groceries'), '10000', '5000');
    await budgetSpent(await category('Transport'), '10000', '0');

    const month = await status();

    expect(month).toMatchObject({
      month: '2026-10-01',
      currency: 'TST',
      budgets: 2,
      totalBudget: '20000.0000',
      totalUsed: '5000.0000',
      totalRemaining: '15000.0000',
      percent: '25.00',
      status: 'green',
      label: 'On track',
      token: '--color-positive',
      threshold: 80,
    });
  });

  it('says nothing rather than zero when the month has no budgets to be a percentage of', async () => {
    const month = await status();

    // `0%` would read as "nothing spent against nothing planned" — the same thing a real budget at 0% says.
    // `null` keeps "no plan" and "no spending against a plan" apart.
    expect(month.percent).toBeNull();
    expect(month.status).toBeNull();
    expect(month.label).toBeNull();
    expect(month.token).toBeNull();
    expect(month.budgets).toBe(0);
    expect(month.totalBudget).toBe('0.0000');
    expect(month.alerts).toEqual([]);
  });
});

describe('alerts are the bar statuses, restated (Task 5.3, §10)', () => {
  it('carries every non-green bar, with the same figures the bar itself carries', async () => {
    await budgetSpent(await category('Groceries'), '10000', '10000'); // exactly on the limit
    await budgetSpent(await category('Transport'), '10000', '12000'); // past it
    await budgetSpent(await category('Shopping'), '10000', '1000'); // well inside it

    const month = await status();
    const listed = await bars();

    // The month's own colour is green, and there is a red category in it. Deriving alerts from the
    // aggregate would report nothing here, which is the failure mode this test exists for.
    expect(month.status).toBe('green');
    expect(month.percent).toBe('76.67');

    expect(month.alerts.map((alert) => alert.categoryName)).toEqual(['Groceries', 'Transport']);
    expect(month.alerts.map((alert) => alert.status)).toEqual(['yellow', 'red']);

    // "The same status the Budget Bar already shows" — so equal, not merely similar. Both endpoints build
    // their bars from one array, and this is what says so.
    for (const alert of month.alerts) {
      const bar = listed.find((candidate) => candidate.categoryId === alert.categoryId);

      expect(alert, alert.categoryName).toEqual(bar);
    }
  });

  it('words exactly 100% as spent but not exceeded, and 80% as approaching the limit', async () => {
    await budgetSpent(await category('Groceries'), '10000', '8000');
    await budgetSpent(await category('Transport'), '10000', '10000');

    const month = await status();

    expect(month.alerts.map((alert) => [alert.percent, alert.label, alert.token])).toEqual([
      ['80.00', 'Approaching limit', '--color-warning'],
      ['100.00', 'Spent, not exceeded', '--color-warning'],
    ]);
  });

  it('starts alerting at the threshold rather than below it', async () => {
    await budgetSpent(await category('Groceries'), '10000', '7999');

    expect((await status()).alerts).toEqual([]);

    await budgetSpent(await category('Transport'), '10000', '8000');

    expect((await status()).alerts.map((alert) => alert.categoryName)).toEqual(['Transport']);
  });

  it('raises nothing for a month with budgets and no spending', async () => {
    await budgetSpent(await category('Groceries'), '10000', '0');

    const month = await status();
    expect(month.alerts).toEqual([]);
    expect(month.status).toBe('green');
    expect(month.percent).toBe('0.00');
  });
});

describe('alerts are derived when they are asked for (Task 5.3, ADR-0011, ADR-0018)', () => {
  it('changes its answer when the stored rows change, with nothing running in between', async () => {
    const groceries = await category('Groceries');
    await budgetSpent(groceries, '10000', '12000');

    expect((await status()).alerts.map((alert) => alert.status)).toEqual(['red']);

    const overspend = await prisma.transaction.findFirstOrThrow({
      where: { user_id: ledger.userId, category_id: groceries },
    });
    await deleteTransaction(ledger.request(`/api/transactions/${overspend.id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: overspend.id }),
    });

    // No job ran, no queue drained, nothing was invalidated: the alert was never stored to begin with.
    const after = await status();
    expect(after.alerts).toEqual([]);
    expect(after.totalUsed).toBe('0.0000');
  });

  it('has no delivery mechanism anywhere on the alert path (ADR-0018)', async () => {
    const dir = join(process.cwd(), 'src', 'server', 'budgets');
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));

    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const source = readFileSync(join(dir, name), 'utf8');

      // Reminders are in-app only (ADR-0018), and there is no worker and no queue at all (ADR-0011). A
      // budget alert cannot reach anybody while the app is closed, and this asserts the path has no
      // mechanism to do it with rather than asserting the limitation away.
      expect(source, name).not.toMatch(
        /bullmq|ioredis|redis|nodemailer|web-?push|sendgrid|twilio|node-cron|setInterval/i,
      );
    }

    // And no scheduled surface: the two things under this endpoint are the ones an open screen calls.
    const routes = readdirSync(join(process.cwd(), 'app', 'api', 'budgets'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(routes.sort()).toEqual(['[id]', 'status']);
  });
});

describe('reading the month status (Task 5.3)', () => {
  it('refuses a read that does not say which month', async () => {
    const response = await monthStatusRoute(ledger.request('/api/budgets/status'), undefined);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: 'validation_failed',
      field: 'month',
    });
  });

  it('reports one month, not the ones around it', async () => {
    await budgetSpent(await category('Groceries'), '10000', '12000');

    const november = await status('2026-11');
    expect(november.budgets).toBe(0);
    expect(november.alerts).toEqual([]);
  });
});
