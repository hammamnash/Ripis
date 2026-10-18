import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hash, verify } from '../src/server/auth/password';
import type { Caller } from '../src/server/context';
import { resetPassword } from '../src/server/users/reset-password';
import { CURRENCIES, prisma, resetLedger, seedCurrencies } from './helpers/db';

const EMAILS = {
  admin: 'reset-spec-admin@ripis.test',
  target: 'reset-spec-target@ripis.test',
  member: 'reset-spec-member@ripis.test',
};

const OLD_PASSWORD = 'the-old-password';
const admin: Caller = { id: '', role: 'admin' };
const member: Caller = { id: '', role: 'user' };
const target = { id: '' };

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

async function auditRows() {
  return prisma.auditLog.findMany({
    where: { actor_user_id: admin.id },
    orderBy: { created_at: 'asc' },
  });
}

beforeAll(async () => {
  await seedCurrencies();
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });

  const made = await prisma.user.create({
    data: {
      name: 'Reset Spec Admin',
      email: EMAILS.admin,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
      role: 'admin',
    },
  });
  admin.id = made.id;

  const victim = await prisma.user.create({
    data: {
      name: 'Reset Spec Target',
      email: EMAILS.target,
      password_hash: await hash(OLD_PASSWORD),
      primary_currency_id: CURRENCIES.base.code,
    },
  });
  target.id = victim.id;

  const other = await prisma.user.create({
    data: {
      name: 'Reset Spec Member',
      email: EMAILS.member,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });
  member.id = other.id;
});

afterAll(async () => {
  for (const user of await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  })) {
    await resetLedger(user.id);
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.currency.deleteMany({
    where: { code: { in: [CURRENCIES.base.code, CURRENCIES.zeroDecimal.code] } },
  });
  await prisma.$disconnect();
});

describe('an admin resetting another account’s password (FR-16, §14)', () => {
  it('returns a new password once, and stores only a hash of it', async () => {
    const { password } = await resetPassword({ actor: admin, userId: target.id });

    expect(password).toMatch(/^[a-z2-9]{12}$/);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verify(row.password_hash, password)).toBe(true);
    expect(await verify(row.password_hash, OLD_PASSWORD)).toBe(false);
    expect(row.password_hash).not.toContain(password);
  });

  it('leaves the plaintext in neither the account row nor the audit row', async () => {
    const { password } = await resetPassword({ actor: admin, userId: target.id });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { actor_user_id: admin.id, action: 'password_changed' },
      orderBy: { created_at: 'desc' },
    });

    const stored = JSON.stringify([row.password_hash, entry.before_value, entry.after_value]);
    expect(stored).not.toContain(password);
  });

  it('hands back a different password each time', async () => {
    const first = await resetPassword({ actor: admin, userId: target.id });
    const second = await resetPassword({ actor: admin, userId: target.id });

    expect(second.password).not.toBe(first.password);
  });

  it('appends exactly one row per reset, about the account it changed', async () => {
    const before = await auditRows();
    const { password } = await resetPassword({ actor: admin, userId: target.id });

    const after = await auditRows();
    expect(after).toHaveLength(before.length + 1);

    const entry = after.at(-1)!;
    expect(entry.action).toBe('password_changed');
    expect(entry.entity_type).toBe('user');
    expect(entry.entity_id).toBe(target.id);
    expect(entry.actor_user_id).toBe(admin.id);
    expect(entry.user_id).toBe(admin.id);
    expect(await verify((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).password_hash, password)).toBe(true);
  });

  it('refuses a caller who is not an admin, and changes nothing', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

    await expect(resetPassword({ actor: member, userId: target.id })).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.password_hash).toBe(before.password_hash);
  });

  it('refuses a user id that does not exist', async () => {
    await expect(resetPassword({ actor: admin, userId: UNKNOWN_ID })).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });
});
