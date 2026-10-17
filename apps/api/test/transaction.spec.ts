import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CURRENCIES,
  columnsOf,
  createTestUser,
  indexesOf,
  prisma,
  resetLedger,
  seedCurrencies,
  teardownTestData,
} from './helpers/db';

/**
 * Task 1.4 — `Transaction` (FR-02, FR-06, ADR-0004, ADR-0007, ADR-0022).
 *
 * The claims here are about shape, not arithmetic: three amounts and no rate anywhere, a calendar
 * date for reporting beside a timestamp for audit, and no attachment column. The CHECK constraints
 * that police which combinations are legal are Task 1.7's, so this file deliberately does not
 * assert them — a constraint that does not exist yet cannot be tested.
 */
describe('Transaction (Task 1.4, ADR-0004)', () => {
  let userId: string;
  let walletId: string;
  let categoryId: string;

  /** A minimal expense in the test currency, in the shape the API will write. */
  const expense = () => ({
    user_id: userId,
    transaction_type: 'expense' as const,
    occurred_on: new Date('2026-10-17'),
    wallet_id: walletId,
    category_id: categoryId,
    amount: '150000',
    currency_id: CURRENCIES.base.code,
    base_amount: '150000',
    base_currency_id: CURRENCIES.base.code,
  });

  beforeAll(async () => {
    await seedCurrencies();
    userId = await createTestUser();
  });

  afterAll(teardownTestData);

  beforeEach(async () => {
    await resetLedger(userId);
    walletId = (
      await prisma.wallet.create({
        data: {
          user_id: userId,
          name: 'Cash',
          wallet_type: 'cash',
          is_liability: false,
          currency_id: CURRENCIES.base.code,
          opening_balance: '0',
          current_balance: '0',
        },
      })
    ).id;
    categoryId = (
      await prisma.category.create({
        data: { user_id: userId, name: 'Groceries', type: 'expense', color: '#333333' },
      })
    ).id;
  });

  it('has no column whose name contains rate', async () => {
    const columns = (await columnsOf('transaction')).map((column) => column.column_name);
    expect(columns.filter((name) => /rate/i.test(name))).toEqual([]);
  });

  it('stores all three amounts as numeric(19,4), and only the destination amount is optional', async () => {
    const columns = await columnsOf('transaction');

    for (const name of ['amount', 'base_amount', 'destination_amount']) {
      const column = columns.find((candidate) => candidate.column_name === name);
      expect({ name, precision: column?.numeric_precision, scale: column?.numeric_scale }).toEqual({
        name,
        precision: 19,
        scale: 4,
      });
    }

    expect(columns.find((c) => c.column_name === 'destination_amount')?.is_nullable).toBe('YES');
    expect(columns.find((c) => c.column_name === 'amount')?.is_nullable).toBe('NO');
    expect(columns.find((c) => c.column_name === 'base_amount')?.is_nullable).toBe('NO');
  });

  it('keeps reporting and audit time apart: occurred_on is a date, recorded_at a timestamptz', async () => {
    const columns = await columnsOf('transaction');
    expect(columns.find((c) => c.column_name === 'occurred_on')?.data_type).toBe('date');
    expect(columns.find((c) => c.column_name === 'recorded_at')?.data_type).toBe(
      'timestamp with time zone',
    );
  });

  it('defaults tags to an empty array rather than null', async () => {
    const transaction = await prisma.transaction.create({ data: expense() });
    expect(transaction.tags).toEqual([]);
    expect((await columnsOf('transaction')).find((c) => c.column_name === 'tags')?.data_type).toBe(
      'ARRAY',
    );
  });

  it('freezes the base amount and its currency alongside the source amount', async () => {
    const transaction = await prisma.transaction.create({ data: expense() });
    expect(transaction.amount.toString()).toBe('150000');
    expect(transaction.base_amount.toString()).toBe('150000');
    expect(transaction.base_currency_id).toBe(CURRENCIES.base.code);
    expect(transaction.destination_amount).toBeNull();
  });

  it('refuses a base currency that does not exist', async () => {
    const attempt = await prisma.transaction
      .create({ data: { ...expense(), base_currency_id: 'NOPE' } })
      .catch((error: { code?: string }) => error);
    expect(attempt.code).toBe('P2003');
  });

  it('has no attachment column, and receipt_number is a reference not a file (ADR-0022)', async () => {
    const columns = (await columnsOf('transaction')).map((column) => column.column_name);
    expect(columns.filter((name) => /attach|file|image|blob|upload/i.test(name))).toEqual([]);
    expect(columns).toContain('receipt_number');
  });

  it('carries a GIN index on tags, so a tag filter does not scan (ADR-0021)', async () => {
    const definitions = (await indexesOf('transaction')).map((index) => index.indexdef).join('\n');
    expect(definitions).toMatch(/USING gin \(tags\)/);
  });

  it('soft deletes rather than removes (ADR-0005)', async () => {
    expect(
      (await columnsOf('transaction')).find((c) => c.column_name === 'deleted_at')?.is_nullable,
    ).toBe('YES');
  });

  it('indexes the four hot queries, and no index on the source amount', async () => {
    const definitions = (await indexesOf('transaction')).map((index) => index.indexdef).join('\n');
    expect(definitions).toContain('(user_id, occurred_on DESC)');
    expect(definitions).toContain('(user_id, wallet_id, occurred_on)');
    expect(definitions).toContain('(user_id, category_id, occurred_on)');
    expect(definitions).toContain('(user_id, base_amount)');
    // An amount range across mixed currencies is only meaningful in the base currency, so the
    // source amount is deliberately not indexed (`02-context.md` §3).
    expect(definitions).not.toContain('(user_id, amount)');
  });
});
