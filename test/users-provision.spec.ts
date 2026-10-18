import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verify } from '../src/server/auth/password';
import type { Caller } from '../src/server/context';
import { createUser } from '../src/server/users/create-user';
import { CURRENCIES, prisma, resetLedger, seedCurrencies } from './helpers/db';

const EMAIL = 'provision-spec@ripis.test';
const MADE = ['made-by-admin@ripis.test', 'made-twice@ripis.test'];
const admin: Caller = { id: '', role: 'admin' };
const member: Caller = { id: '', role: 'user' };

async function auditRows() {
  return prisma.auditLog.findMany({ where: { actor_user_id: admin.id }, orderBy: { created_at: 'asc' } });
}

beforeAll(async () => {
  await seedCurrencies();

  for (const email of [EMAIL, ...MADE]) {
    await prisma.user.deleteMany({ where: { email } });
  }

  const created = await prisma.user.create({
    data: {
      name: 'Provision Spec',
      email: EMAIL,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });
  admin.id = created.id;

  const other = await prisma.user.create({
    data: {
      name: 'Provision Spec Member',
      email: 'provision-spec-member@ripis.test',
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });
  member.id = other.id;
});

afterAll(async () => {
  for (const user of await prisma.user.findMany({
    where: { email: { in: [EMAIL, 'provision-spec-member@ripis.test', ...MADE] } },
    select: { id: true },
  })) {
    await resetLedger(user.id);
  }
  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL, 'provision-spec-member@ripis.test', ...MADE] } },
  });
  await prisma.currency.deleteMany({
    where: { code: { in: [CURRENCIES.base.code, CURRENCIES.zeroDecimal.code] } },
  });
  await prisma.$disconnect();
});

describe('an admin creating an account (ADR-0013)', () => {
  it('creates it as an ordinary user, and records exactly one row for it', async () => {
    const before = await auditRows();

    const created = await createUser({
      actor: admin,
      name: 'Made By Admin',
      email: MADE[0]!,
      password: 'a-good-password',
      primaryCurrencyId: CURRENCIES.base.code,
    });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.role).toBe('user');
    expect(row.email).toBe(MADE[0]);
    expect(await verify(row.password_hash, 'a-good-password')).toBe(true);

    const after = await auditRows();
    expect(after).toHaveLength(before.length + 1);

    const entry = after.at(-1)!;
    expect(entry.action).toBe('created');
    expect(entry.entity_type).toBe('user');
    expect(entry.entity_id).toBe(created.id);
    // The row about another account lives in the actor's ledger (ADR-0046).
    expect(entry.user_id).toBe(admin.id);
    expect(entry.actor_user_id).toBe(admin.id);
  });

  it('records nothing that could be a password, not even a hash', async () => {
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { actor_user_id: admin.id, entity_type: 'user' },
      orderBy: { created_at: 'desc' },
    });

    const written = JSON.stringify([entry.before_value, entry.after_value]).toLowerCase();
    expect(written).not.toContain('password');
    expect(written).not.toContain('hash');
    expect(entry.before_value).toBeNull();
  });

  it('refuses an email that is already taken, and creates nothing', async () => {
    await expect(
      createUser({
        actor: admin,
        name: 'Made Twice',
        email: MADE[0]!,
        password: 'a-good-password',
        primaryCurrencyId: CURRENCIES.base.code,
      }),
    ).rejects.toMatchObject({ code: 'email_taken', status: 409 });

    expect(await prisma.user.count({ where: { email: MADE[0] } })).toBe(1);
  });

  it('refuses a primary currency that does not exist, rather than failing on the foreign key', async () => {
    await expect(
      createUser({
        actor: admin,
        name: 'No Such Currency',
        email: MADE[1]!,
        password: 'a-good-password',
        primaryCurrencyId: 'NOPE',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed', field: 'primaryCurrencyId' });

    expect(await prisma.user.count({ where: { email: MADE[1] } })).toBe(0);
  });

  it('holds the new password to the same minimum as a changed one', async () => {
    await expect(
      createUser({
        actor: admin,
        name: 'Too Short',
        email: MADE[1]!,
        password: 'short',
        primaryCurrencyId: CURRENCIES.base.code,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed', field: 'password' });
  });

  it('refuses a caller who is not an admin', async () => {
    await expect(
      createUser({
        actor: member,
        name: 'Not Allowed',
        email: MADE[1]!,
        password: 'a-good-password',
        primaryCurrencyId: CURRENCIES.base.code,
      }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });

    expect(await prisma.user.count({ where: { email: MADE[1] } })).toBe(0);
  });
});
