import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CURRENCIES,
  createTestUser,
  indexesOf,
  prisma,
  resetLedger,
  seedCurrencies,
  teardownTestData,
} from './helpers/db';

/**
 * Task 1.7 — the rules that are structural live in the database (`02-context.md` §3, ADR-0012).
 *
 * Each constraint is asserted in BOTH directions: the violating row is refused *by Postgres* —
 * the assertion looks for the constraint name in the error, so a DTO cannot be mistaken for the
 * guard — and a legal row of the same shape is accepted. A constraint only ever tested in the
 * rejecting direction is indistinguishable from one that rejects everything.
 */
describe('CHECK constraints and trigram indexes (Task 1.7)', () => {
  let userId: string;
  let walletId: string;
  let categoryId: string;

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

  const refused = async (write: () => Promise<unknown>): Promise<string> => {
    try {
      await write();
      return 'NO ERROR — the database accepted a row it should have refused';
    } catch (error) {
      return String((error as { message?: string }).message ?? error);
    }
  };

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
        data: { user_id: userId, name: 'Groceries', type: 'expense', color: '#555555' },
      })
    ).id;
  });

  it('declares every constraint in the database, not only in a service', async () => {
    const names = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE contype = 'c' AND conrelid IN ('transaction'::regclass, 'budget'::regclass)
      ORDER BY conname
    `;
    expect(names.map((row) => row.conname).sort()).toEqual([
      'amount_positive',
      'base_amount_positive',
      'budget_amount_positive',
      'exchange_needs_destination_amount',
      'income_expense_need_category',
      'transfer_needs_destination',
    ]);
  });

  it('refuses an amount that is not positive, and accepts a positive one (§7)', async () => {
    expect(await refused(() => prisma.transaction.create({ data: { ...expense(), amount: '0' } }))).toMatch(
      /amount_positive/,
    );
    expect(
      await refused(() => prisma.transaction.create({ data: { ...expense(), amount: '-1' } })),
    ).toMatch(/amount_positive/);

    await expect(
      prisma.transaction.create({ data: { ...expense(), amount: '1' } }),
    ).resolves.toBeDefined();
  });

  it('refuses a non-positive base_amount', async () => {
    expect(
      await refused(() => prisma.transaction.create({ data: { ...expense(), base_amount: '0' } })),
    ).toMatch(/base_amount_positive/);
  });

  it('requires a destination wallet for a transfer, and accepts one that has it', async () => {
    expect(
      await refused(() =>
        prisma.transaction.create({
          data: {
            ...expense(),
            transaction_type: 'transfer',
            category_id: null,
            destination_wallet_id: null,
          },
        }),
      ),
    ).toMatch(/transfer_needs_destination/);

    await expect(
      prisma.transaction.create({
        data: {
          ...expense(),
          transaction_type: 'transfer',
          category_id: null,
          destination_wallet_id: walletId,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('requires a category for an expense or an income, and accepts one that has it', async () => {
    expect(
      await refused(() => prisma.transaction.create({ data: { ...expense(), category_id: null } })),
    ).toMatch(/income_expense_need_category/);

    await expect(
      prisma.transaction.create({ data: { ...expense(), category_id: categoryId } }),
    ).resolves.toBeDefined();
  });

  it('requires both sides of an exchange, and accepts one that has them', async () => {
    expect(
      await refused(() =>
        prisma.transaction.create({
          data: {
            ...expense(),
            transaction_type: 'exchange',
            category_id: null,
            destination_wallet_id: walletId,
            destination_amount: null,
          },
        }),
      ),
    ).toMatch(/exchange_needs_destination_amount/);

    await expect(
      prisma.transaction.create({
        data: {
          ...expense(),
          transaction_type: 'exchange',
          category_id: null,
          destination_wallet_id: walletId,
          destination_amount: '100000',
        },
      }),
    ).resolves.toBeDefined();
  });

  it('refuses a budget whose limit is not positive', async () => {
    const month = new Date('2026-10-01');
    expect(
      await refused(() =>
        prisma.budget.create({ data: { user_id: userId, category_id: categoryId, amount: '0', month } }),
      ),
    ).toMatch(/budget_amount_positive/);

    await expect(
      prisma.budget.create({ data: { user_id: userId, category_id: categoryId, amount: '1', month } }),
    ).resolves.toBeDefined();
  });

  it('carries trigram indexes so server-side search does not table-scan (FR-13)', async () => {
    const definitions = (await indexesOf('transaction')).map((index) => index.indexdef).join('\n');
    expect(definitions).toContain('gin_trgm_ops');
    expect(definitions).toMatch(/description gin_trgm_ops/);
    expect(definitions).toMatch(/notes gin_trgm_ops/);
  });
});
