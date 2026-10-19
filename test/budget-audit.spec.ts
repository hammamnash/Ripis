import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  codeOfRefusal,
  columnsOf,
  createTestUser,
  indexesOf,
  prisma,
  resetLedger,
  seedCurrencies,
  teardownTestData,
} from './helpers/db';

/** Declared in the schema, and asserted here so a later edit cannot quietly drop one. */
const AUDIT_ACTIONS = [
  'created',
  'updated',
  'deleted',
  'restored',
  'archived',
  'exported',
  'signed_in',
  'auth_failed',
  'password_changed',
  'imported',
] as const;

const AUDIT_ENTITIES = ['transaction', 'wallet', 'budget', 'category', 'user', 'auth', 'export', 'import'] as const;

/**
 * Task 1.5 — `Budget` and `AuditLog` (FR-10, FR-14).
 *
 * The audit enum is the interesting half: `exported`, `signed_in`, `auth_failed` and
 * `password_changed` are not variations of created/updated/deleted/restored, so an enum that could
 * only express the latter would fail at the first INSERT. Every value is written here to prove it
 * is representable, in both directions — against the rows and against the stored enum itself.
 */
describe('Budget and AuditLog (Task 1.5, FR-10, FR-14)', () => {
  let userId: string;
  let categoryId: string;

  const budget = (month: string, amount = '1000000') => ({
    user_id: userId,
    category_id: categoryId,
    amount,
    month: new Date(month),
  });

  beforeAll(async () => {
    await seedCurrencies();
    userId = await createTestUser();
  });

  afterAll(teardownTestData);

  beforeEach(async () => {
    await resetLedger(userId);
    categoryId = (
      await prisma.category.create({
        data: { user_id: userId, name: 'Groceries', type: 'expense', color: '#444444' },
      })
    ).id;
  });

  it('allows one budget per category per month, and the next month separately', async () => {
    await prisma.budget.create({ data: budget('2026-10-01') });

    const duplicate = await codeOfRefusal(() => prisma.budget.create({ data: budget('2026-10-01') }));
    expect(duplicate).toBe('P2002');

    await expect(prisma.budget.create({ data: budget('2026-11-01') })).resolves.toBeDefined();
    expect(await prisma.budget.count({ where: { user_id: userId } })).toBe(2);
  });

  it('stores the month as a calendar date and the amount as numeric(19,4)', async () => {
    const columns = await columnsOf('budget');
    expect(columns.find((c) => c.column_name === 'month')?.data_type).toBe('date');

    const amount = columns.find((c) => c.column_name === 'amount');
    expect({ precision: amount?.numeric_precision, scale: amount?.numeric_scale }).toEqual({
      precision: 19,
      scale: 4,
    });
  });

  it('has no deleted_at: a budget is edited, not removed', async () => {
    expect((await columnsOf('budget')).map((c) => c.column_name)).not.toContain('deleted_at');
  });

  it('can record every declared audit action, so none is unrepresentable', async () => {
    for (const action of AUDIT_ACTIONS) {
      await prisma.auditLog.create({
        data: { user_id: userId, actor_user_id: userId, entity_type: 'auth', action },
      });
    }
    expect(await prisma.auditLog.count({ where: { user_id: userId } })).toBe(AUDIT_ACTIONS.length);

    const stored = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'AuditAction'
      ORDER BY enumsortorder
    `;
    expect(stored.map((value) => value.enumlabel)).toEqual(AUDIT_ACTIONS);
  });

  it('accepts every declared entity type', async () => {
    const stored = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'AuditEntity'
      ORDER BY enumsortorder
    `;
    expect(stored.map((value) => value.enumlabel)).toEqual(AUDIT_ENTITIES);
  });

  it('keeps before and after as JSON, with entity_id null for an act rather than a row', async () => {
    const record = await prisma.auditLog.create({
      data: {
        user_id: userId,
        actor_user_id: userId,
        entity_type: 'transaction',
        entity_id: null,
        action: 'updated',
        before_value: { amount: '1000' },
        after_value: { amount: '2000' },
      },
    });

    expect(record.before_value).toEqual({ amount: '1000' });
    expect(record.after_value).toEqual({ amount: '2000' });
    expect(record.entity_id).toBeNull();
  });

  it('carries no foreign key, so an audit row outlives whatever it describes', async () => {
    const foreignKeys = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'audit_log'::regclass AND contype = 'f'
    `;
    expect(foreignKeys).toEqual([]);

    const indexes = (await indexesOf('audit_log')).map((index) => index.indexdef).join('\n');
    expect(indexes).toContain('(user_id, created_at DESC)');
  });
});
