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
