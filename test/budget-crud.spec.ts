import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DELETE as deleteBudgetRoute, PATCH as editBudgetRoute } from '../app/api/budgets/[id]/route';
import { GET as listBudgetsRoute, POST as createBudgetRoute } from '../app/api/budgets/route';
import { POST as archiveCategory } from '../app/api/categories/[id]/archive/route';
import { POST as createCategory } from '../app/api/categories/route';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 5.1 — budgets (FR-10, §10), against the endpoints the Budgets screen calls.
 *
 * The claims worth a spec here are the ones a plausible-looking implementation would get wrong:
 *
 * 1. **A month is a month, however it was written.** `2026-10` and `2026-10-15` and `2026-10-01` are one
 *    budget, not three. An implementation that stored what it was given would let a caller create three
 *    budgets for one month and the unique index would never notice — it would be comparing strings a
 *    `date` column had already normalised.
 * 2. **One budget per category per month is a 409 naming the field**, not a 500 carrying Postgres' text.
 * 3. **A budget is for spending**, so an income category is refused — its bar could never move.
 * 4. **`amount` must be positive**, because it is the denominator of every percentage computed from it.
 * 5. **`categoryId` and `month` cannot be edited** — together they are the budget's identity, and a
 *    `PATCH` that moved them would mean the same thing as delete-then-create while writing one audit row.
 * 6. **Deleting is a hard delete and the audit row is what survives it** (§10), which is why a second
 *    `DELETE` is a 404 rather than a second `200`.
 * 7. **Every write appends exactly one audit row** (§14, FR-14), including the delete.
 * 8. **Another account's budget is a 404, not a 403** (ADR-0020).
 */
const EMAIL = 'phase-5-budgets@ripis.test';

const OCTOBER = '2026-10';
const NOVEMBER = '2026-11';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let ledger: SpecLedger;
let groceries: string;
let transport: string;
let salary: string;

async function category(type: 'income' | 'expense', name: string): Promise<string> {
  const response = await createCategory(
    ledger.request('/api/categories', { method: 'POST', body: { name, type, color: '#D22129' } }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

  return ((await response.json()) as { id: string }).id;
}

function post(body: Record<string, unknown>): Promise<Response> {
  return createBudgetRoute(ledger.request('/api/budgets', { method: 'POST', body }), undefined);
}

/** A budget that must be accepted, returning its id — most tests below are about one that is not. */
async function accepted(categoryId: string, month: string, amount: string): Promise<string> {
  const response = await post({ categoryId, amount, month });

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

  return ((await response.json()) as { id: string }).id;
}

interface Refusal {
  code: string;
  message: string;
  field?: string;
}

/**
 * The error body, read once.
 *
 * It returns the whole body rather than picking fields out, because a `Response` body can only be read
 * once — a helper that read it and returned `{code}` left nothing for a later `response.clone()`, which
 * is how this spec first failed. Assertions below use `toMatchObject`, so the message being present is
 * not a mismatch.
 */
async function refusal(response: Response): Promise<Refusal> {
  return ((await response.json()) as { error: Refusal }).error;
}

async function budgetAudits(userId: string) {
  return prisma.auditLog.findMany({
    where: { user_id: userId, entity_type: 'budget' },
    orderBy: { created_at: 'asc' },
  });
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
  await prisma.category.deleteMany({ where: { user_id: ledger.userId } });
  await prisma.auditLog.deleteMany({ where: { user_id: ledger.userId } });

  groceries = await category('expense', 'Groceries');
  transport = await category('expense', 'Transport');
  salary = await category('income', 'Salary');
});

describe('creating a budget (FR-10, §10)', () => {
  it('stores the month as the first day of it, whichever way the month was written', async () => {
    const created = await post({ categoryId: groceries, amount: '1000000', month: '2026-10-15' });
    expect(created.status).toBe(201);

    const body = (await created.json()) as { month: string; amount: string };
    expect(body.month).toBe('2026-10-01');
    expect(body.amount).toBe('1000000.0000');

    // Stored, not merely echoed: a UTC-midnight `date` is what makes a month boundary independent of
    // whoever is asking (ADR-0007).
    const stored = await prisma.budget.findFirstOrThrow({ where: { user_id: ledger.userId } });
    expect(stored.month.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('treats the shorthand month and a day inside it as the same month', async () => {
    await accepted(groceries, '2026-10', '1000000');

    const shorthand = await post({ categoryId: transport, amount: '100000', month: '2026-10-01' });
    expect(shorthand.status).toBe(201);

    // Two budgets, one month. An implementation that compared the raw strings would have let the same
    // category be budgeted three times for October.
    const again = await post({ categoryId: groceries, amount: '2000000', month: '2026-10-20' });
    expect(again.status).toBe(409);

    expect(await prisma.budget.count({ where: { user_id: ledger.userId } })).toBe(2);
  });

  it('refuses a second budget for the same category and month, naming the field', async () => {
    await accepted(groceries, OCTOBER, '1000000');

    const duplicate = await post({ categoryId: groceries, amount: '500000', month: OCTOBER });
    expect(duplicate.status).toBe(409);
    expect(await refusal(duplicate)).toMatchObject({
      code: 'budget_already_exists',
      field: 'categoryId',
    });
  });

  it('allows the next month separately', async () => {
    await accepted(groceries, OCTOBER, '1000000');
    await accepted(groceries, NOVEMBER, '1200000');

    expect(await prisma.budget.count({ where: { user_id: ledger.userId } })).toBe(2);
  });

  it('allows a past month and a future month, which are corrections and plans', async () => {
    // A budget for a month already spent is how a typo is repaired; there is no soft delete to undo it
    // with, so refusing the month would strand it. What makes it safe is the audit row, not a date rule.
    await accepted(groceries, '2025-01', '500000');
    await accepted(transport, '2027-06', '250000');

    expect(await prisma.budget.count({ where: { user_id: ledger.userId } })).toBe(2);
  });

  it('refuses a zero or negative budget, naming the field', async () => {
    for (const amount of ['0', '-1000000']) {
      const response = await post({ categoryId: groceries, amount, month: OCTOBER });

      expect(response.status, amount).toBe(400);
      expect((await refusal(response)).field, amount).toBe('amount');
    }

    // A budget is the denominator of its own percentage, so a zero one would produce a confident status
    // computed from nothing rather than a visible error.
    expect(await prisma.budget.count({ where: { user_id: ledger.userId } })).toBe(0);
  });

  it('refuses an income category, because spending can never be filed under one', async () => {
    const response = await post({ categoryId: salary, amount: '1000000', month: OCTOBER });

    expect(response.status).toBe(400);
    expect(await refusal(response)).toMatchObject({
      code: 'category_type_mismatch',
      field: 'categoryId',
    });
  });

  it('refuses an archived category, and says it was a budget that was refused', async () => {
    await archiveCategory(
      ledger.request(`/api/categories/${transport}/archive`, { method: 'POST' }),
      ctx(transport),
    );

    const response = await post({ categoryId: transport, amount: '1000000', month: OCTOBER });
    expect(response.status).toBe(400);

    const refused = await refusal(response);
    expect(refused.code).toBe('category_archived');

    // The refusal names the act it refused. This sentence is shared with the transaction path, which
    // passes its own wording, and asserting it here is what keeps the two from being confused later.
    expect(refused.message).toContain('on a budget');
  });

  it('refuses a category belonging to another account with a 404', async () => {
    const other = await signedInLedger('phase-5-budgets-other@ripis.test');

    try {
      const theirs = await createCategory(
        other.request('/api/categories', {
          method: 'POST',
          body: { name: 'Theirs', type: 'expense', color: '#444444' },
        }),
        undefined,
      );
      const theirsId = ((await theirs.json()) as { id: string }).id;

      const response = await post({ categoryId: theirsId, amount: '1000000', month: OCTOBER });

      expect(response.status).toBe(404);
      expect(await prisma.budget.count({ where: { user_id: other.userId } })).toBe(0);
    } finally {
      await closeLedger(other);
    }
  });

  it('appends exactly one audit row, with the row it describes', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');
    const audits = await budgetAudits(ledger.userId);

    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe('created');
    expect(audits[0]?.entity_id).toBe(id);
    expect(audits[0]?.after_value).toMatchObject({ amount: '1000000.0000', month: '2026-10-01' });
  });
});

describe('listing budgets (FR-10, §10)', () => {
  it('returns one month, ordered by the category name a person reads', async () => {
    await accepted(transport, OCTOBER, '100000');
    await accepted(groceries, OCTOBER, '1000000');
    await accepted(groceries, NOVEMBER, '1200000');

    const response = await listBudgetsRoute(
      ledger.request(`/api/budgets?month=${OCTOBER}`),
      undefined,
    );
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as {
      data: { categoryName: string; amount: string; month: string }[];
    };

    expect(data.map((row) => row.categoryName)).toEqual(['Groceries', 'Transport']);
    expect(data.map((row) => row.month)).toEqual(['2026-10-01', '2026-10-01']);
  });

  it('is empty for a month with no budgets, rather than every budget there is', async () => {
    await accepted(groceries, OCTOBER, '1000000');

    const response = await listBudgetsRoute(ledger.request('/api/budgets?month=2026-12'), undefined);
    const { data } = (await response.json()) as { data: unknown[] };

    expect(data).toEqual([]);
  });

  it('refuses a read that does not say which month', async () => {
    // The API does not answer "what month is it?" — see `budgets/month.ts` for why a default would have
    // to pick a clock and be silently wrong for somebody.
    const response = await listBudgetsRoute(ledger.request('/api/budgets'), undefined);

    expect(response.status).toBe(400);
    expect(await refusal(response)).toMatchObject({ code: 'validation_failed', field: 'month' });
  });

  it('carries the category so one bar needs one request', async () => {
    await accepted(groceries, OCTOBER, '1000000');

    const response = await listBudgetsRoute(ledger.request(`/api/budgets?month=${OCTOBER}`), undefined);
    const { data } = (await response.json()) as { data: Record<string, unknown>[] };

    expect(data[0]?.categoryName).toBe('Groceries');
    expect(data[0]?.categoryColor).toBe('#D22129');
    expect(data[0]?.categoryId).toBe(groceries);
  });
});

describe('editing and removing a budget (FR-10, §10)', () => {
  it('changes the amount and appends one audit row holding both values', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');

    const response = await editBudgetRoute(
      ledger.request(`/api/budgets/${id}`, { method: 'PATCH', body: { amount: '1500000' } }),
      ctx(id),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { amount: string }).amount).toBe('1500000.0000');

    const audits = await budgetAudits(ledger.userId);
    expect(audits).toHaveLength(2);
    expect(audits[1]?.action).toBe('updated');
    expect(audits[1]?.before_value).toMatchObject({ amount: '1000000.0000' });
    expect(audits[1]?.after_value).toMatchObject({ amount: '1500000.0000' });
  });

  it('refuses to move a budget to another month or category, and says what to do instead', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');

    for (const body of [{ month: NOVEMBER }, { categoryId: transport }]) {
      const response = await editBudgetRoute(
        ledger.request(`/api/budgets/${id}`, { method: 'PATCH', body }),
        ctx(id),
      );

      const refused = await refusal(response);

      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(refused.code, JSON.stringify(body)).toBe('immutable_field');
      expect(refused.message).toContain('delete it and create');
    }

    const stored = await prisma.budget.findFirstOrThrow({ where: { id } });
    expect(stored.month.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(stored.category_id).toBe(groceries);
  });

  it('refuses a field a budget does not have, and a request that changes nothing', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');

    const unknown = await editBudgetRoute(
      ledger.request(`/api/budgets/${id}`, { method: 'PATCH', body: { name: 'Food' } }),
      ctx(id),
    );
    expect(unknown.status).toBe(400);
    expect((await refusal(unknown)).field).toBe('name');

    const empty = await editBudgetRoute(
      ledger.request(`/api/budgets/${id}`, { method: 'PATCH', body: {} }),
      ctx(id),
    );
    expect(empty.status).toBe(400);

    expect(await budgetAudits(ledger.userId)).toHaveLength(1);
  });

  it('refuses an edit that would set the amount to zero', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');

    const response = await editBudgetRoute(
      ledger.request(`/api/budgets/${id}`, { method: 'PATCH', body: { amount: '0' } }),
      ctx(id),
    );

    expect(response.status).toBe(400);
    expect((await refusal(response)).field).toBe('amount');
    expect(await budgetAudits(ledger.userId)).toHaveLength(1);
  });

  it('deletes the row for real and keeps the audit row that says so', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');

    const response = await deleteBudgetRoute(
      ledger.request(`/api/budgets/${id}`, { method: 'DELETE' }),
      ctx(id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });

    // A hard delete: a soft-deleted budget would keep occupying `(user_id, category_id, month)` and make
    // the category unbudgetable for that month forever (§10).
    expect(await prisma.budget.count({ where: { id } })).toBe(0);

    const audits = await budgetAudits(ledger.userId);
    expect(audits.at(-1)?.action).toBe('deleted');
    expect(audits.at(-1)?.entity_id).toBe(id);
    expect(audits.at(-1)?.before_value).toMatchObject({ amount: '1000000.0000' });

    // And the month is free again, which is the whole reason it is a hard delete.
    await expect(accepted(groceries, OCTOBER, '900000')).resolves.toBeDefined();
  });

  it('is a 404 the second time, because there is nothing left to delete', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');

    await deleteBudgetRoute(ledger.request(`/api/budgets/${id}`, { method: 'DELETE' }), ctx(id));

    const again = await deleteBudgetRoute(
      ledger.request(`/api/budgets/${id}`, { method: 'DELETE' }),
      ctx(id),
    );
    expect(again.status).toBe(404);
    expect(await budgetAudits(ledger.userId)).toHaveLength(2);
  });

  it('cannot be reached through another account, on either verb', async () => {
    const id = await accepted(groceries, OCTOBER, '1000000');
    const other = await signedInLedger('phase-5-budgets-other@ripis.test');

    try {
      const patched = await editBudgetRoute(
        other.request(`/api/budgets/${id}`, { method: 'PATCH', body: { amount: '1' } }),
        ctx(id),
      );
      const deleted = await deleteBudgetRoute(
        other.request(`/api/budgets/${id}`, { method: 'DELETE' }),
        ctx(id),
      );

      expect(patched.status).toBe(404);
      expect(deleted.status).toBe(404);
      expect(await prisma.budget.count({ where: { id } })).toBe(1);
    } finally {
      await closeLedger(other);
    }
  });
});
