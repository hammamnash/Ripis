import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '../src/server/db';
import { runAsCaller } from '../src/server/context';
import { CURRENCIES, prisma, resetLedger, seedCurrencies, teardownTestData } from './helpers/db';

/**
 * Task 1.9 — every read and write is structurally scoped to the caller (ADR-0020).
 *
 * The plan asks for this over HTTP: "zero of user B's rows from every list endpoint", and
 * "GET /api/wallets/:id for B's wallet must 404, not 403". The API is still health-only, so this
 * drives the mechanism at the layer those endpoints will sit on — the client extension plus the
 * caller context. The HTTP assertions arrive with the first endpoints.
 *
 * A scoped read cannot distinguish "not yours" from "not there", which is exactly why the
 * endpoints get a 404: the caller's id joins the where clause, so the row simply is not found.
 */

const USER_A = 'scope-user-a@ripis.test';
const USER_B = 'scope-user-b@ripis.test';

const SCOPED_MODELS = ['wallet', 'category', 'transaction', 'budget', 'auditLog'] as const;

/** The application's own client, so this suite drives the handle server code actually imports. */
const scoped = db;
let userA: string;
let userB: string;
let walletB: string;

async function createUser(email: string, name: string): Promise<string> {
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });
  return user.id;
}

/** Fixture setup runs outside any caller context, which is the point: it is not scoped. */
async function seedLedger(userId: string, label: string): Promise<string> {
  const wallet = await prisma.wallet.create({
    data: {
      user_id: userId,
      name: `${label} wallet`,
      wallet_type: 'cash',
      is_liability: false,
      currency_id: CURRENCIES.base.code,
      opening_balance: '0',
      current_balance: '0',
    },
  });
  const category = await prisma.category.create({
    data: { user_id: userId, name: `${label} category`, type: 'expense', color: '#123456' },
  });
  await prisma.transaction.create({
    data: {
      user_id: userId,
      transaction_type: 'expense',
      occurred_on: new Date('2026-10-17'),
      wallet_id: wallet.id,
      category_id: category.id,
      amount: '1000',
      currency_id: CURRENCIES.base.code,
      base_amount: '1000',
      base_currency_id: CURRENCIES.base.code,
    },
  });
  await prisma.budget.create({
    data: {
      user_id: userId,
      category_id: category.id,
      amount: '5000',
      month: new Date('2026-10-01'),
    },
  });
  await prisma.auditLog.create({
    data: { user_id: userId, actor_user_id: userId, entity_type: 'wallet', action: 'created' },
  });
  return wallet.id;
}

/** Reports what a call did: the refusal message, or a marker if it was wrongly allowed. */
async function outcomeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'NO ERROR — the call was allowed';
  } catch (error) {
    return String((error as Error).message ?? error);
  }
}

const delegate = (model: string) =>
  (
    scoped as unknown as Record<
      string,
      { findMany: (args: Record<string, unknown>) => Promise<{ user_id: string }[]> }
    >
  )[model];

describe('User scoping (Task 1.9, ADR-0020)', () => {
  beforeAll(async () => {
    await seedCurrencies();
    userA = await createUser(USER_A, 'Scope A');
    userB = await createUser(USER_B, 'Scope B');
    await seedLedger(userA, 'A');
    walletB = await seedLedger(userB, 'B');
  });

  afterAll(async () => {
    await resetLedger(userA);
    await resetLedger(userB);
    await prisma.user.deleteMany({ where: { email: { in: [USER_A, USER_B] } } });
    await teardownTestData();
  });

  it('lists only the caller rows, on every scoped model', async () => {
    for (const model of SCOPED_MODELS) {
      const rows = await runAsCaller({ id: userA, role: 'user' }, () =>
        delegate(model)!.findMany({}),
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.user_id === userA)).toBe(true);
    }
  });

  it('cannot reach another user row by primary key, which is the 404 and not a 403', async () => {
    const found = await runAsCaller({ id: userA, role: 'user' }, () =>
      scoped.wallet.findUnique({ where: { id: walletB } }),
    );
    expect(found).toBeNull();
  });

  it('cannot update another user row', async () => {
    const outcome = await outcomeOf(() =>
      runAsCaller({ id: userA, role: 'user' }, () =>
        scoped.wallet.update({ where: { id: walletB }, data: { name: 'hijacked' } }),
      ),
    );
    expect(outcome).not.toContain('NO ERROR');
  });

  it('cannot delete another user row, and leaves it in place', async () => {
    const outcome = await outcomeOf(() =>
      runAsCaller({ id: userA, role: 'user' }, () => scoped.wallet.delete({ where: { id: walletB } })),
    );
    expect(outcome).not.toContain('NO ERROR');
    const survivor = await prisma.wallet.findUnique({ where: { id: walletB } });
    expect(survivor?.name).toBe('B wallet');
  });

  it('overrides a where clause that tries to name another owner', async () => {
    const escaped = await runAsCaller({ id: userA, role: 'user' }, () =>
      scoped.wallet.findMany({ where: { user_id: userB } }),
    );
    expect(escaped.length).toBeGreaterThan(0);
    expect(escaped.every((row) => row.user_id === userA)).toBe(true);
  });

  it('gives a write the caller as owner when the caller does not name one', async () => {
    // The generated types insist on an owner, so the argument is loosened deliberately: what is
    // under test is the runtime guarantee, not the type.
    const loose = scoped.wallet as unknown as {
      create: (args: { data: Record<string, unknown> }) => Promise<{ user_id: string }>;
    };
    const created = await runAsCaller({ id: userA, role: 'user' }, () =>
      loose.create({
        data: {
          name: 'unowned',
          wallet_type: 'cash',
          is_liability: false,
          currency_id: CURRENCIES.base.code,
          opening_balance: '0',
          current_balance: '0',
        },
      }),
    );
    expect(created.user_id).toBe(userA);
  });

  it('refuses a write that names another owner rather than silently retargeting it', async () => {
    const outcome = await outcomeOf(() =>
      runAsCaller({ id: userA, role: 'user' }, () =>
        scoped.wallet.create({
          data: {
            user_id: userB,
            name: 'smuggled',
            wallet_type: 'cash',
            is_liability: false,
            currency_id: CURRENCIES.base.code,
            opening_balance: '0',
            current_balance: '0',
          },
        }),
      ),
    );
    expect(outcome).toMatch(/owner/i);
    expect(await prisma.wallet.count({ where: { user_id: userB } })).toBe(1);
  });

  it('refuses a scoped query outside a caller context instead of returning everything', async () => {
    const outcome = await outcomeOf(() => scoped.wallet.findMany({}));
    expect(outcome).toMatch(/caller/i);
  });

  it('leaves reference data readable without a caller', async () => {
    const rows = await scoped.currency.findMany({});
    expect(rows.map((row) => row.code)).toContain(CURRENCIES.base.code);
  });

  /*
   * Two tests stood here and went with the framework (ADR-0039). They drove the request-time
   * establishment of the caller through `CallerContextInterceptor`: the authenticated caller lands
   * in context so a handler's scoped reads are the caller's rows, and an unauthenticated request
   * runs with no caller at all.
   *
   * Both claims are still owed, and are now Task 2.3's — they belong to whatever establishes the
   * context for a route handler, and there is no interceptor to test. They are recorded here rather
   * than deleted quietly so the gap is visible. The second half of the second test, that shared
   * reference data still reads with no caller, is asserted above and always was.
   */
});
