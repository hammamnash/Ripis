import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as archiveCategory } from '../app/api/categories/[id]/archive/route';
import { PATCH as editCategory } from '../app/api/categories/[id]/route';
import { GET as listCategories, POST as createCategory } from '../app/api/categories/route';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 3.12 — the category endpoints, folded into Phase 3 because nothing else in the phase works without
 * them: the database requires a category on every `expense` and `income` row, so a ledger cannot contain a
 * spend that a user could not first have created a category for.
 *
 * What is being asserted is the set of decisions ADR-0014 makes: one level, no deleting, a type that is
 * permanent, and a colour that belongs to the user.
 */
const EMAIL = 'phase-3-category@ripis.test';
const OTHER_EMAIL = 'phase-3-category-other@ripis.test';

let ledger: SpecLedger;
let other: SpecLedger;

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
  other = await signedInLedger(OTHER_EMAIL);
});

afterAll(async () => {
  await closeLedger(ledger);
  await closeLedger(other);
  await teardownTestData();
  await prisma.$disconnect();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

interface CategoryBody {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string | null;
  archivedAt: string | null;
  error?: { code: string; field?: string };
}

async function create(ledgerToUse: SpecLedger, overrides: Record<string, unknown> = {}) {
  const response = await createCategory(
    ledgerToUse.request('/api/categories', {
      method: 'POST',
      body: { name: 'Groceries', type: 'expense', color: '#D22129', ...overrides },
    }),
    undefined,
  );

  return { status: response.status, body: (await response.json()) as CategoryBody };
}

async function listed(ledgerToUse: SpecLedger = ledger, query = ''): Promise<CategoryBody[]> {
  const response = await listCategories(
    ledgerToUse.request(`/api/categories${query === '' ? '' : `?${query}`}`),
    undefined,
  );

  return ((await response.json()) as { data: CategoryBody[] }).data;
}

describe('a category is one level, typed, and coloured by its owner (FR-01, ADR-0014, ADR-0030)', () => {
  it('creates a category with the colour it was given, unchanged', async () => {
    const created = await create(ledger, { name: 'Coffee', color: '#0F766E' });

    expect(created.status).toBe(201);
    expect(created.body.color).toBe('#0F766E');
    expect(created.body.archivedAt).toBeNull();
  });

  it('refuses a colour it was not given rather than assigning one', async () => {
    const response = await createCategory(
      ledger.request('/api/categories', { method: 'POST', body: { name: 'No colour', type: 'expense' } }),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as CategoryBody).error).toMatchObject({
      code: 'validation_failed',
      field: 'color',
    });
  });

  it('has no parent category to accept', async () => {
    const created = await create(ledger, { name: 'Nested attempt', parentId: '00000000-0000-0000-0000-000000000000' });

    expect(created.status).toBe(400);
    expect(created.body.error).toMatchObject({ code: 'validation_failed', field: 'parentId' });
  });

  it('allows the same name under both types, and refuses the same name twice under one', async () => {
    const asIncome = await create(ledger, { name: 'Gift', type: 'income' });
    const asExpense = await create(ledger, { name: 'Gift', type: 'expense' });

    expect(asIncome.status).toBe(201);
    expect(asExpense.status).toBe(201);

    const again = await create(ledger, { name: 'Gift', type: 'income' });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'duplicate_category', field: 'name' });
  });

  it('refuses a type that is neither income nor expense', async () => {
    const created = await create(ledger, { name: 'Transfer fee', type: 'transfer' });

    expect(created.status).toBe(400);
    expect(created.body.error).toMatchObject({ code: 'validation_failed', field: 'type' });
  });

  it('filters by type, because the transaction form needs one half at a time', async () => {
    await create(ledger, { name: 'OnlyIncome', type: 'income' });
    await create(ledger, { name: 'OnlyExpense', type: 'expense' });

    const incomes = (await listed(ledger, 'type=income')).map((category) => category.name);
    const expenses = (await listed(ledger, 'type=expense')).map((category) => category.name);

    expect(incomes).toContain('OnlyIncome');
    expect(incomes).not.toContain('OnlyExpense');
    expect(expenses).toContain('OnlyExpense');
    expect(expenses).not.toContain('OnlyIncome');
  });
});

describe('a category cannot become the other type (ADR-0014)', () => {
  it('refuses type, leaves the row untouched, and still allows a rename', async () => {
    const created = await create(ledger, { name: 'Rename me', type: 'expense' });
    const before = await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } });

    const refused = await editCategory(
      ledger.request(`/api/categories/${created.body.id}`, { method: 'PATCH', body: { type: 'income' } }),
      ctx(created.body.id),
    );

    expect(refused.status).toBe(400);
    expect(((await refused.json()) as CategoryBody).error).toMatchObject({
      code: 'immutable_field',
      field: 'type',
    });
    expect(await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } })).toEqual(before);

    const renamed = await editCategory(
      ledger.request(`/api/categories/${created.body.id}`, { method: 'PATCH', body: { name: 'Renamed' } }),
      ctx(created.body.id),
    );
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as CategoryBody).name).toBe('Renamed');
  });

  it('clears an icon with an explicit null, and an absent field leaves it alone', async () => {
    const created = await create(ledger, { name: 'Icon test', icon: 'coffee' });

    const cleared = await editCategory(
      ledger.request(`/api/categories/${created.body.id}`, { method: 'PATCH', body: { icon: null } }),
      ctx(created.body.id),
    );
    expect(((await cleared.json()) as CategoryBody).icon).toBeNull();

    const untouched = await editCategory(
      ledger.request(`/api/categories/${created.body.id}`, { method: 'PATCH', body: { name: 'Icon test, renamed' } }),
      ctx(created.body.id),
    );
    expect(((await untouched.json()) as CategoryBody).icon).toBeNull();
  });
});

describe('a category is archived, never deleted (ADR-0014)', () => {
  it('stamps archived_at, drops out of the default list, and stays for the rows that point at it', async () => {
    const created = await create(ledger, { name: 'Retired', type: 'expense' });

    await prisma.transaction.create({
      data: {
        user_id: ledger.userId,
        transaction_type: 'expense',
        occurred_on: new Date('2026-10-02T00:00:00.000Z'),
        wallet_id: (
          await prisma.wallet.create({
            data: {
              user_id: ledger.userId,
              name: 'Wallet for Retired',
              wallet_type: 'cash',
              is_liability: false,
              currency_id: 'TST',
              opening_balance: '0.0000',
              current_balance: '0.0000',
            },
          })
        ).id,
        category_id: created.body.id,
        amount: '1000.0000',
        currency_id: 'TST',
        base_amount: '1000.0000',
        base_currency_id: 'TST',
      },
    });

    const archived = await archiveCategory(
      ledger.request(`/api/categories/${created.body.id}/archive`, { method: 'POST' }),
      ctx(created.body.id),
    );

    expect(archived.status).toBe(200);
    expect(((await archived.json()) as CategoryBody).archivedAt).not.toBeNull();

    expect((await listed()).map((category) => category.name)).not.toContain('Retired');
    expect((await listed(ledger, 'includeArchived=true')).map((category) => category.name)).toContain('Retired');

    // The row is still there, and so is the transaction that names it.
    expect(await prisma.category.count({ where: { id: created.body.id } })).toBe(1);
    expect(await prisma.transaction.count({ where: { category_id: created.body.id } })).toBe(1);
  });

  it('keeps the name of an archived category, and says so instead of colliding', async () => {
    const created = await create(ledger, { name: 'Kept name', type: 'expense' });
    await archiveCategory(
      ledger.request(`/api/categories/${created.body.id}/archive`, { method: 'POST' }),
      ctx(created.body.id),
    );

    // The unique constraint spans archived rows — it has no partial predicate — so the name is genuinely
    // taken. The failure worth preventing is a 500 from the unique violation, or a message that claims the
    // category is still in use when it is not.
    const reuse = await create(ledger, { name: 'Kept name', type: 'expense' });

    expect(reuse.status).toBe(409);
    expect(reuse.body.error).toMatchObject({ code: 'duplicate_category', field: 'name' });
    expect(await prisma.category.count({ where: { name: 'Kept name' } })).toBe(1);
  });
});

describe('a category is only reachable by its owner (ADR-0020)', () => {
  it('another account can neither rename, archive nor list it', async () => {
    const created = await create(ledger, { name: 'Private category', type: 'expense' });

    expect(
      (
        await editCategory(
          other.request(`/api/categories/${created.body.id}`, { method: 'PATCH', body: { name: 'Stolen' } }),
          ctx(created.body.id),
        )
      ).status,
    ).toBe(404);

    expect(
      (
        await archiveCategory(
          other.request(`/api/categories/${created.body.id}/archive`, { method: 'POST' }),
          ctx(created.body.id),
        )
      ).status,
    ).toBe(404);

    expect((await listed(other)).map((category) => category.name)).not.toContain('Private category');
    expect(await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({
      name: 'Private category',
      archived_at: null,
    });
  });
});
