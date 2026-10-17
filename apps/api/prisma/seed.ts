import type { PrismaClient } from '@prisma/client';

import { hash } from '../src/auth/password.service';

/**
 * The admin account, seeded from the environment (ADR-0013, ADR-0019).
 *
 * Two rules, and each exists because of one specific failure.
 *
 * 1. `ADMIN_USERNAME` holds an **email address**. There is no username column, and the address is
 *    the identifier rather than a contact channel, because no other feature needs an email
 *    (01-prd.md §4, ADR-0013). The variable keeps its name deliberately.
 * 2. The password is hashed **only when the row is created**. Re-hashing on every boot changes the
 *    stored hash while the row still exists, so nothing looks broken and the owner is locked out of
 *    their own ledger by a restart (ADR-0019, 01-prd.md §1024). The early return below IS the fix;
 *    that is why it is the second statement in the function and why the spec asserts the stored
 *    hash is byte-identical across two runs.
 *
 * A missing credential throws instead of falling back to a default: a default password is a live
 * credential in a repository, and ADR-0013 rejects it in writing.
 */
/**
 * The currencies the app ships with (ADR-0003).
 *
 * This is reference data, not user data: without these rows `User.primary_currency_id` — a foreign
 * key — has nothing to point at, and the app's own default of `IDR` cannot be satisfied on a fresh
 * database. `minor_unit` is the whole reason the column exists: IDR and VND have no decimal places
 * and USD has two, so a single global scale would render `Rp 1.250.000,00`.
 */
const REFERENCE_CURRENCIES = [
  { code: 'IDR', name: 'Indonesian rupiah', symbol: 'Rp', minor_unit: 0 },
  { code: 'VND', name: 'Vietnamese dong', symbol: '\u20ab', minor_unit: 0 },
  { code: 'USD', name: 'US dollar', symbol: '$', minor_unit: 2 },
];

/**
 * Inserts the reference currencies, and leaves existing rows exactly as they are.
 *
 * `update: {}` is deliberate: on a re-run the row is found and nothing is written, so an operator
 * who corrected a symbol or a minor unit keeps their correction instead of having it reverted by
 * the next deploy.
 */
export async function seedReferenceCurrencies(prisma: PrismaClient): Promise<number> {
  for (const currency of REFERENCE_CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency,
    });
  }

  return REFERENCE_CURRENCIES.length;
}

export async function seedAdmin(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'ADMIN_USERNAME and ADMIN_PASSWORD must be set: the admin is seeded from the environment and never from a default (ADR-0013).',
    );
  }

  const existing = await prisma.user.findFirst({ where: { email: username } });
  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      name: username,
      email: username,
      role: 'admin',
      password_hash: await hash(password),
      primary_currency_id: env.ADMIN_PRIMARY_CURRENCY ?? 'IDR',
    },
  });
}
