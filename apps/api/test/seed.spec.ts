import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedAdmin } from '../prisma/seed';
import { CURRENCIES, prisma, seedCurrencies, teardownTestData } from './helpers/db';

/**
 * Task 2.2 — the admin seed (ADR-0013, ADR-0019).
 *
 * ADR-0019 exists because of one bug: re-hashing the admin password on every boot changes the
 * stored hash, and the owner is locked out of their own ledger by a restart. So the assertions
 * below are about *not* doing something — the seed is idempotent, byte for byte, and the guard
 * that keeps it safe is the early return on an existing row, not a careful-looking hash call.
 *
 * The seed reads its credential from the environment and aborts when it is unset (ADR-0013): no
 * default password, ever, because a default is a credential in a repository.
 */
const ADMIN_EMAIL = 'seed-admin@ripis.test';
const PASSWORD = 'a-strong-passphrase-for-tests';

const env = {
  ADMIN_USERNAME: ADMIN_EMAIL,
  ADMIN_PASSWORD: PASSWORD,
  ADMIN_PRIMARY_CURRENCY: CURRENCIES.base.code,
};

async function removeAdmin(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
}

describe('Admin seed (Task 2.2, ADR-0013, ADR-0019)', () => {
  beforeAll(async () => {
    await seedCurrencies();
    await removeAdmin();
  });

  afterAll(async () => {
    await removeAdmin();
    await teardownTestData();
  });

  it('hashes once: a second run leaves the stored hash byte-identical', async () => {
    const first = await seedAdmin(prisma, env);
    const storedHash = first.password_hash;

    await seedAdmin(prisma, env);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: first.id } });

    expect(after.password_hash).toBe(storedHash);
    expect(await prisma.user.count({ where: { email: ADMIN_EMAIL } })).toBe(1);
  });

  it('leaves a password that still verifies, so the lockout cannot happen quietly', async () => {
    const admin = await seedAdmin(prisma, env);
    const { verify } = await import('../src/auth/password.service');

    expect(await verify(admin.password_hash, PASSWORD)).toBe(true);
  });

  it('aborts loudly when a credential is unset, and never falls back to a default', async () => {
    await expect(seedAdmin(prisma, {})).rejects.toThrow(/ADMIN_USERNAME/);
    await expect(seedAdmin(prisma, { ADMIN_USERNAME: ADMIN_EMAIL })).rejects.toThrow(
      /ADMIN_PASSWORD/,
    );
  });

  it('creates an admin with the configured primary currency, and stores no plaintext', async () => {
    const admin = await seedAdmin(prisma, env);

    expect(admin.role).toBe('admin');
    expect(admin.email).toBe(ADMIN_EMAIL);
    expect(admin.primary_currency_id).toBe(CURRENCIES.base.code);
    expect(admin.password_hash).not.toContain(PASSWORD);
    expect(admin.password_hash.startsWith('$argon2id$')).toBe(true);
  });
});
