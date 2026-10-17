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
 * Task 1.2 — `Wallet` (FR-08, ADR-0025).
 *
 * The claims worth a test here are the ones a later change could quietly undo: `is_liability` is
 * required and has no default to fall back on, money is `numeric(19,4)`, and `active` is not a
 * synonym for `deleted_at`.
 */
describe('Wallet (Task 1.2)', () => {
  let userId: string;

  beforeAll(async () => {
    await seedCurrencies();
    userId = await createTestUser();
  });

  beforeEach(async () => {
    await resetLedger(userId);
  });

  afterAll(async () => {
    await teardownTestData();
  });

  it('requires is_liability, with no database default to infer it from', async () => {
    const columns = await columnsOf('wallet');
    const isLiability = columns.find((column) => column.column_name === 'is_liability');

    expect(isLiability).toMatchObject({ is_nullable: 'NO', column_default: null });

    // Prisma is not the thing being tested — the column is. Raw SQL omits the flag entirely, so
    // only a database-level NOT NULL can refuse it.
    const insert = prisma.$executeRawUnsafe(
      `INSERT INTO "wallet" (id, user_id, name, wallet_type, currency_id, opening_balance,
         current_balance, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'no flag', 'cash', $2, 0, 0, now())`,
      userId,
      CURRENCIES.base.code,
    );

    await expect(insert).rejects.toThrow(/23502|not-null/i);
  });

  it('stores money as numeric(19,4), never floating point', async () => {
    const columns = await columnsOf('wallet');
    const money = ['opening_balance', 'current_balance'].map((name) => {
      const column = columns.find((candidate) => candidate.column_name === name);
      return {
        name,
        type: column?.data_type,
        precision: column?.numeric_precision,
        scale: column?.numeric_scale,
      };
    });

    expect(money).toEqual([
      { name: 'opening_balance', type: 'numeric', precision: 19, scale: 4 },
      { name: 'current_balance', type: 'numeric', precision: 19, scale: 4 },
    ]);
  });

  it('keeps an archived wallet in history but out of pickers', async () => {
    await prisma.wallet.create({
      data: {
        user_id: userId,
        name: 'Archived card',
        wallet_type: 'credit_card',
        is_liability: true,
        currency_id: CURRENCIES.base.code,
        opening_balance: 0,
        current_balance: 2000000,
        active: false,
      },
    });

    // A picker asks for live wallets; history does not filter on `active`.
    const pickable = await prisma.wallet.findMany({
      where: { user_id: userId, deleted_at: null, active: true },
    });
    const history = await prisma.wallet.findMany({ where: { user_id: userId, deleted_at: null } });

    expect(pickable).toHaveLength(0);
    expect(history.map((wallet) => wallet.name)).toEqual(['Archived card']);
  });

  it('drops a soft-deleted wallet from every list but keeps the row', async () => {
    await prisma.wallet.create({
      data: {
        user_id: userId,
        name: 'Removed wallet',
        wallet_type: 'cash',
        is_liability: false,
        currency_id: CURRENCIES.base.code,
        opening_balance: 0,
        current_balance: 0,
        deleted_at: new Date(),
      },
    });

    const visible = await prisma.wallet.findMany({
      where: { user_id: userId, deleted_at: null },
    });

    expect(visible).toHaveLength(0);
    // Soft means the row survives — that is the whole point of ADR-0005.
    await expect(prisma.wallet.count({ where: { user_id: userId } })).resolves.toBe(1);
  });

  it('does not enforce opening_balance immutability — that is a service rule', async () => {
    const wallet = await prisma.wallet.create({
      data: {
        user_id: userId,
        name: 'Opening balance',
        wallet_type: 'cash',
        is_liability: false,
        currency_id: CURRENCIES.base.code,
        opening_balance: 100,
        current_balance: 100,
      },
    });

    const updated = await prisma.wallet.update({
      where: { id: wallet.id },
      data: { opening_balance: 999 },
    });

    // Pinned deliberately: the database permits it, so Task 3.x has to refuse it at the API.
    // Without this test the next reader assumes the schema guards the field.
    expect(updated.opening_balance.toString()).toBe('999');
  });

  it('indexes wallet by (user_id, deleted_at)', async () => {
    const indexes = await indexesOf('wallet');

    expect(indexes.map((index) => index.indexdef).join('\n')).toContain('(user_id, deleted_at)');
  });
});
