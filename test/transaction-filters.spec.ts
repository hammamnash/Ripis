import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as listTransactionsRoute, POST as createTransaction } from '../app/api/transactions/route';
import { POST as createCategory } from '../app/api/categories/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * The seven filters of §13 (FR-13, Task 6.2).
 *
 * Five of these already existed and are asserted here so that "seven" means seven — a count nobody verifies is
 * a count that silently reverts to five.
 *
 * The two new ones carry the weight of the file, because both have a plausible wrong answer:
 *
 * **Amount Range reads `base_amount`, not `amount`.** A range over rows in six currencies compares figures
 * that are not comparable — 1,000,000 in a zero-decimal currency against 63 dollars — so the comparable
 * figure is the frozen base amount in the user's primary currency, and `(user_id, base_amount)` is the only
 * amount index there is (§3 of `02-context.md`, ADR-0004). The fixture is built to fail if the filter reads
 * the wrong column in *either* direction: row 4 is in range by its base amount and out of range by its own,
 * row 8 is the reverse, and both have to land on the correct side.
 *
 * **Currency reads the transaction's own currency.** `base_currency_id` is the primary currency by
 * definition (ADR-0004, ADR-0015), so a filter on it would keep every row. Row 6 is a transfer *into* the
 * zero-decimal currency and is the assertion that the filter reads the row's currency rather than either leg.
 */

let ledger: SpecLedger;
let tstWalletId: string;
let ts0WalletId: string;
let foodId: string;
let transportId: string;
let salaryId: string;

/** The window used by the amount-range assertions, chosen so the two discriminators sit on opposite sides of it. */
const WINDOW = 'amountMin=500000&amountMax=1500000';

beforeAll(async () => {
  ledger = await signedInLedger('phase-6-filters@ripis.test');

  const wallet = async (name: string, currencyId: string) => {
    const response = await createWallet(
      ledger.request('/api/wallets', {
        method: 'POST',
        body: { name, walletType: 'cash', currencyId, openingBalance: '0.0000' },
      }),
      undefined,
    );

    return ((await response.json()) as { id: string }).id;
  };

  tstWalletId = await wallet('Filters TST', 'TST');
  ts0WalletId = await wallet('Filters TS0', 'TS0');

  const category = async (name: string, type: 'expense' | 'income') => {
    const response = await createCategory(
      ledger.request('/api/categories', { method: 'POST', body: { name, type, color: '#D22129' } }),
      undefined,
    );

    return ((await response.json()) as { id: string }).id;
  };

  foodId = await category('Filters Food', 'expense');
  transportId = await category('Filters Transport', 'expense');
  // An income needs a category of its own type, so the income fixture cannot borrow an expense category.
  salaryId = await category('Filters Salary', 'income');

  const record = async (body: Record<string, unknown>) => {
    const response = await createTransaction(ledger.request('/api/transactions', { method: 'POST', body }), undefined);
    const answer = await response.text();

    // The reason goes into the failure, because a fixture that will not create is a 400 from somewhere in
    // `prepare.ts` and the status alone says nothing about which rule refused it.
    expect(response.status, answer).toBe(201);
  };

  await record({
    transactionType: 'expense',
    occurredOn: '2026-03-05',
    walletId: tstWalletId,
    categoryId: foodId,
    amount: '50000',
    baseAmount: '50000',
    tags: ['urgent'],
    description: 'march coffee',
  });
  await record({
    transactionType: 'expense',
    occurredOn: '2026-03-20',
    walletId: tstWalletId,
    categoryId: transportId,
    amount: '25000',
    baseAmount: '25000',
    tags: ['work'],
    description: 'march bus',
  });
  await record({
    transactionType: 'expense',
    occurredOn: '2026-04-10',
    walletId: tstWalletId,
    categoryId: foodId,
    amount: '75000',
    baseAmount: '75000',
    description: 'april lunch',
  });
  // Own amount 120,000 (out of the window) with a base amount of 1,200,000 (inside it).
  await record({
    transactionType: 'expense',
    occurredOn: '2026-04-15',
    walletId: ts0WalletId,
    categoryId: foodId,
    amount: '120000',
    baseAmount: '1200000',
    description: 'april zero-decimal',
  });
  await record({
    transactionType: 'income',
    occurredOn: '2026-04-18',
    walletId: tstWalletId,
    categoryId: salaryId,
    amount: '900000',
    baseAmount: '900000',
    description: 'april salary',
  });
  // A transfer into the zero-decimal wallet: its own currency is still TST.
  await record({
    transactionType: 'transfer',
    occurredOn: '2026-04-20',
    walletId: tstWalletId,
    destinationWalletId: ts0WalletId,
    amount: '30000',
    destinationAmount: '300000',
    baseAmount: '30000',
    description: 'april to zero',
  });
  await record({
    transactionType: 'transfer',
    occurredOn: '2026-04-22',
    walletId: ts0WalletId,
    destinationWalletId: tstWalletId,
    amount: '50000',
    destinationAmount: '5000',
    baseAmount: '5000',
    description: 'april to tst',
  });
  // Own amount 1,000,000 (inside the window) with a base amount of 100,000 (outside it).
  await record({
    transactionType: 'expense',
    occurredOn: '2026-04-25',
    walletId: ts0WalletId,
    categoryId: transportId,
    amount: '1000000',
    baseAmount: '100000',
    description: 'april big zero',
  });
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
  await prisma.$disconnect();
});

const list = async (query: string) => {
  const response = await listTransactionsRoute(ledger.request(`/api/transactions?${query}&perPage=100`), undefined);

  expect(response.status).toBe(200);

  return (await response.json()) as { data: { description: string | null }[]; total: number };
};

/** The descriptions a filter returns, sorted, because the list's own order is by date and not the point here. */
const found = async (query: string): Promise<string[]> => {
  const page = await list(query);

  expect(page.total).toBe(page.data.length);

  return page.data.map((row) => row.description ?? '').sort();
};

const refused = async (query: string) => {
  const response = await listTransactionsRoute(ledger.request(`/api/transactions?${query}`), undefined);

  expect(response.status).toBe(400);

  return (await response.json()) as { error: { code: string; field?: string } };
};

describe('Task 6.2 — the seven filters (§13)', () => {
  it('narrows by date range, inclusive of both days named', async () => {
    // `occurred_on` is a calendar date, so the 1st and the 30th are both April and neither bound needs a
    // timezone to interpret (ADR-0007).
    expect(await found('from=2026-04-01&to=2026-04-30')).toEqual([
      'april big zero',
      'april lunch',
      'april salary',
      'april to tst',
      'april to zero',
      'april zero-decimal',
    ]);
    expect(await found('from=2026-03-05&to=2026-03-05')).toEqual(['march coffee']);
  });

  it('narrows by wallet on either leg, because both legs are that wallet moving', async () => {
    expect(await found(`walletId=${tstWalletId}`)).toHaveLength(6);
    // 'april to tst' arrives in this wallet rather than leaving it, and a filter that read only `wallet_id`
    // would drop it.
    expect(await found(`walletId=${tstWalletId}`)).toContain('april to tst');
    expect(await found(`walletId=${ts0WalletId}`)).toContain('april to zero');
  });

  it('narrows by category, and a transfer has none to match', async () => {
    expect(await found(`categoryId=${foodId}`)).toEqual(['april lunch', 'april zero-decimal', 'march coffee']);
    expect(await found(`categoryId=${transportId}`)).toEqual(['april big zero', 'march bus']);
  });

  it('narrows by tag', async () => {
    expect(await found('tag=urgent')).toEqual(['march coffee']);
    expect(await found('tag=work')).toEqual(['march bus']);
    expect(await found('tag=nobody-tagged-this')).toEqual([]);
  });

  it('narrows by transaction type', async () => {
    expect(await found('type=transfer')).toEqual(['april to tst', 'april to zero']);
    expect(await found('type=income')).toEqual(['april salary']);
    expect(await found('type=expense')).toHaveLength(5);
  });

  it(`reads Amount Range against the base amount, not the row's own amount`, async () => {
    // The window is 500,000–1,500,000 in the primary currency. Row 4's own amount is 120,000, outside it, and
    // it is only in range through its frozen base amount of 1,200,000. Row 8 is the mirror image: its own
    // amount of 1,000,000 is inside the window and its base amount of 100,000 is not. A filter reading the
    // wrong column fails on one of the two, whichever way it is wrong.
    expect(await found(WINDOW)).toEqual(['april salary', 'april zero-decimal']);
  });

  it('applies the amount bounds as decimals, so an exact bound includes its own row', async () => {
    // 50,000.0000 is the bound and 50,000 is the row: a filter that compared floats, or that rounded the
    // bound, is the defect §10 names — and this is what that looks like from outside.
    expect(await found('amountMin=50000.0000')).toEqual([
      'april big zero',
      'april lunch',
      'april salary',
      'april zero-decimal',
      'march coffee',
    ]);
    expect(await found('amountMin=50000.0001')).not.toContain('march coffee');
    expect(await found('amountMax=25000')).toEqual(['april to tst', 'march bus']);
  });

  it('refuses an amount range that is inside out instead of answering with an empty ledger', async () => {
    const body = await refused('amountMin=100&amountMax=10');

    expect(body.error.code).toBe('validation_failed');
    expect(body.error.field).toBe('amountMin');
  });

  it('refuses an amount bound that is not a number', async () => {
    expect((await refused('amountMin=abc')).error.field).toBe('amountMin');
    expect((await refused('amountMax=1.2.3')).error.field).toBe('amountMax');
  });

  it(`narrows by the transaction's own currency, not the destination's`, async () => {
    // Rows 4, 7 and 8 are denominated in TS0. 'april to zero' *arrives* in TS0 and is not one of them: its own
    // currency is TST, and one row has one currency.
    expect(await found('currency=TS0')).toEqual(['april big zero', 'april to tst', 'april zero-decimal']);
    expect(await found('currency=TS0')).not.toContain('april to zero');
  });

  it('accepts a currency code in any case, because the code is not the field name', async () => {
    // §6's casing rule is about field *names*. A filter that answered `data: []` to `ts0` would read as an
    // empty month rather than as a mistyped filter.
    expect(await found('currency=ts0')).toEqual(['april big zero', 'april to tst', 'april zero-decimal']);
    expect(await found('currency=%20TS0%20')).toEqual(['april big zero', 'april to tst', 'april zero-decimal']);
  });

  it('refuses something that is not a currency code at all', async () => {
    expect((await refused('currency=ID')).error.field).toBe('currency');
    expect((await refused('currency=rupiah')).error.field).toBe('currency');
  });

  it('combines filters with AND rather than widening', async () => {
    expect(await found(`currency=TS0&type=expense`)).toEqual(['april big zero', 'april zero-decimal']);
    expect(await found(`from=2026-04-01&to=2026-04-30&walletId=${tstWalletId}&type=expense`)).toEqual(['april lunch']);
    expect(await found(`currency=TS0&type=income`)).toEqual([]);
  });

  it(`answers an unknown wallet with an empty page rather than someone else's rows`, async () => {
    const page = await list('walletId=00000000-0000-4000-8000-000000000000');

    expect(page.data).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('refuses a malformed id as a bad query parameter, not as a server fault', async () => {
    // Before this check, `?walletId=not-a-uuid` reached a `uuid` comparison, failed in the driver, and came
    // back as `500 internal_error` — a fault the user could type. The two id-shaped filters are asserted
    // together because they were wrong together.
    expect((await refused('walletId=not-a-uuid')).error.field).toBe('walletId');
    expect((await refused('categoryId=123')).error.field).toBe('categoryId');
  });
});
