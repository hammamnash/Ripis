import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { writeAudit, writeAudited } from '../src/server/audit';
import { type Caller } from '../src/server/context';
import { db } from '../src/server/db';
import { CURRENCIES, prisma, resetLedger, seedCurrencies } from './helpers/db';

const EMAIL = 'audit-spec@ripis.test';
const actor: Caller = { id: '', role: 'user' };
const EXPIRES_AT = new Date('2030-01-01T00:00:00Z');

async function rows(): Promise<number> {
  return prisma.auditLog.count({ where: { user_id: actor.id } });
}

beforeAll(async () => {
  await seedCurrencies();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: 'Audit Spec',
      email: EMAIL,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });
  actor.id = user.id;
});

afterAll(async () => {
  await resetLedger(actor.id);
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.currency.deleteMany({
    where: { code: { in: [CURRENCIES.base.code, CURRENCIES.zeroDecimal.code] } },
  });
  await prisma.$disconnect();
});

describe('an audited write', () => {
  it('appends exactly one row, and names what it wrote', async () => {
    const before = await rows();

    const written = await writeAudited({
      actor,
      entityType: 'auth',
      action: 'created',
      run: async (tx) => {
        const session = await tx.session.create({
          data: {
            user_id: actor.id,
            refresh_token_hash: 'audit-spec-hash',
            expires_at: EXPIRES_AT,
          },
        });

        return { written: session, entityId: session.id, after: { note: 'a write with a row' } };
      },
    });

    expect(await rows()).toBe(before + 1);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { user_id: actor.id },
      orderBy: { created_at: 'desc' },
    });
    expect(row.actor_user_id).toBe(actor.id);
    expect(row.entity_type).toBe('auth');
    expect(row.entity_id).toBe(written.id);
    expect(row.action).toBe('created');
    expect(row.after_value).toMatchObject({ note: 'a write with a row' });
  });

  it('appends no row when the write itself fails', async () => {
    const before = await rows();

    await expect(
      writeAudited({
        actor,
        entityType: 'auth',
        action: 'created',
        run: async () => {
          throw new Error('the write gave up');
        },
      }),
    ).rejects.toThrow('the write gave up');

    expect(await rows()).toBe(before);
  });

  it('still refuses a scoped read with no caller, inside the transaction', async () => {
    await expect(db.auditLog.count()).rejects.toThrow();
    await expect(db.$transaction(async (tx) => tx.auditLog.count())).rejects.toThrow();
  });
});

describe('writeAudit', () => {
  it('records before and after when it is given them', async () => {
    await writeAudit({
      actor,
      userId: actor.id,
      entityType: 'user',
      entityId: actor.id,
      action: 'updated',
      before: { name: 'before' },
      after: { name: 'after' },
    });

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { user_id: actor.id },
      orderBy: { created_at: 'desc' },
    });
    expect(row.before_value).toMatchObject({ name: 'before' });
    expect(row.after_value).toMatchObject({ name: 'after' });
  });

  it('refuses a row owned by anyone but the actor (ADR-0046)', async () => {
    const FOREIGN = 'b7f4b7d0-0000-4000-8000-000000000000';
    const before = await rows();

    await expect(
      writeAudit({
        actor,
        userId: FOREIGN,
        entityType: 'user',
        action: 'created',
      }),
    ).rejects.toThrow();

    // Scoped to the id that was refused: other spec files run in parallel and own real rows of their own.
    expect(await prisma.auditLog.count({ where: { user_id: FOREIGN } })).toBe(0);
    expect(await rows()).toBe(before);
  });
});
