import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyAuditRetention,
  DEFAULT_AUDIT_RETENTION,
  readAuditRetention,
} from '../src/server/audit-retention';
import { runAsCaller, type Caller } from '../src/server/context';
import { db } from '../src/server/db';
import { CURRENCIES, prisma, resetLedger, seedCurrencies } from './helpers/db';

const EMAIL = 'audit-retention-spec@ripis.test';
const actor: Caller = { id: '', role: 'user' };
const NOW = new Date('2026-10-18T12:00:00Z');
const DAY = 86_400_000;

/** A row that claims to be `days` old, which is the only way to test a retention sweep. */
async function rowAged(days: number): Promise<string> {
  const row = await runAsCaller(actor, () =>
    db.auditLog.create({
      data: {
        user_id: actor.id,
        actor_user_id: actor.id,
        entity_type: 'user',
        entity_id: actor.id,
        action: 'updated',
        before_value: { name: 'before' },
        after_value: { name: 'after' },
        created_at: new Date(NOW.getTime() - days * DAY),
      },
    }),
  );
  return row.id;
}

async function rowById(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}

beforeAll(async () => {
  await seedCurrencies();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: 'Audit Retention Spec',
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

describe('the retention settings (§14)', () => {
  it('defaults to 24 months, compacting after 90 days', () => {
    expect(DEFAULT_AUDIT_RETENTION).toEqual({ retentionMonths: 24, compactAfterDays: 90 });
    expect(readAuditRetention({})).toEqual(DEFAULT_AUDIT_RETENTION);
  });

  it('takes both from the environment', () => {
    expect(
      readAuditRetention({ AUDIT_RETENTION_MONTHS: '6', AUDIT_COMPACT_AFTER_DAYS: '30' }),
    ).toEqual({ retentionMonths: 6, compactAfterDays: 30 });
  });

  it('refuses a value that is not a positive whole number, and names the variable', () => {
    expect(() => readAuditRetention({ AUDIT_RETENTION_MONTHS: '0' })).toThrow(
      /AUDIT_RETENTION_MONTHS/,
    );
    expect(() => readAuditRetention({ AUDIT_COMPACT_AFTER_DAYS: 'soon' })).toThrow(
      /AUDIT_COMPACT_AFTER_DAYS/,
    );
    expect(() => readAuditRetention({ AUDIT_RETENTION_MONTHS: '-3' })).toThrow(
      /AUDIT_RETENTION_MONTHS/,
    );
  });
});

describe('applying the retention', () => {
  it('compacts the before/after of a row past the compaction age, and leaves a fresh one alone', async () => {
    const stale = await rowAged(120);
    const fresh = await rowAged(10);

    const result = await applyAuditRetention(NOW);

    expect(result.compacted).toBeGreaterThanOrEqual(1);
    expect((await rowById(stale))?.before_value).toMatchObject({ compacted: true });
    expect((await rowById(stale))?.after_value).toMatchObject({ compacted: true });
    expect((await rowById(fresh))?.before_value).toMatchObject({ name: 'before' });
  });

  it('compacts nothing the second time', async () => {
    const result = await applyAuditRetention(NOW);
    expect(result).toEqual({ compacted: 0, pruned: 0 });
  });

  it('deletes a row past the retention window, and keeps one inside it', async () => {
    const beyond = await rowAged(800);
    const inside = await rowAged(700);

    const result = await applyAuditRetention(NOW);

    expect(result.pruned).toBeGreaterThanOrEqual(1);
    expect(await rowById(beyond)).toBeNull();
    expect(await rowById(inside)).not.toBeNull();
  });
});
