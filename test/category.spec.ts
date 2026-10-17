import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  codeOfRefusal,
  columnsOf,
  createTestUser,
  prisma,
  seedCurrencies,
  teardownTestData,
} from './helpers/db';

/**
 * Task 1.3 — `Category` (ADR-0014, ADR-0030).
 *
 * A category is one level. There is no `parent_id` and no sub-category table, and a category is
 * never deleted: transactions reference it for their whole life, so it is archived instead. Both
 * claims are asserted against the database rather than against a service that does not exist yet
 * (Task 3.x owns the refusals; here the structure is the contract).
 */
describe('Category (Task 1.3, ADR-0014)', () => {
  let userId: string;

  beforeAll(async () => {
    await seedCurrencies();
    userId = await createTestUser();
  });

  afterAll(teardownTestData);

  beforeEach(async () => {
    await prisma.category.deleteMany({ where: { user_id: userId } });
  });

  it('has no parent_id column and no sub-category table', async () => {
    const names = (await columnsOf('category')).map((column) => column.column_name);
    expect(names).not.toContain('parent_id');

    const nesting = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '%categor%'
        AND table_name <> 'category'
    `;
    expect(nesting).toEqual([]);
  });

  it('is archived rather than deleted: archived_at exists, deleted_at does not', async () => {
    const names = (await columnsOf('category')).map((column) => column.column_name);
    expect(names).toContain('archived_at');
    expect(names).not.toContain('deleted_at');
  });

  it('requires a colour the user chose, with no database default to fall back on', async () => {
    const color = (await columnsOf('category')).find((column) => column.column_name === 'color');
    expect(color?.is_nullable).toBe('NO');
    expect(color?.column_default).toBeNull();
  });

  it('allows one name per type, and the same name on the other side of the ledger', async () => {
    await prisma.category.create({
      data: { user_id: userId, name: 'Transport', type: 'expense', color: '#111111' },
    });

    const duplicate = await codeOfRefusal(() =>
      prisma.category.create({
        data: { user_id: userId, name: 'Transport', type: 'expense', color: '#111111' },
      }),
    );
    expect(duplicate).toBe('P2002');

    await expect(
      prisma.category.create({
        data: { user_id: userId, name: 'Transport', type: 'income', color: '#222222' },
      }),
    ).resolves.toBeDefined();

    expect(await prisma.category.count({ where: { user_id: userId } })).toBe(2);
  });
});
