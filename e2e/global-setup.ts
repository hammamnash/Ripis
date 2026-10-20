import { PrismaClient } from '@prisma/client';

import { E2E_ACCOUNT } from './helpers';

/**
 * The fixture account, created before any spec runs.
 *
 * Task 7.2's harness needed no database: it measured `/probe`, a static page. The guard changed that — every
 * screen in the `(app)` group now redirects to `/sign-in` without a live session, so the suite cannot measure
 * a single pixel of the shell until something can sign in. This is that something.
 *
 * It runs here rather than in `auth.setup.ts` because creating a row is not a browser interaction, and
 * because the setup project would then need `DATABASE_URL` in the *browser* context, which it has no business
 * having. The client is a fresh `PrismaClient` on purpose: the app's is behind the caller scope, and a scope
 * with no caller is exactly the thing that would fail here.
 *
 * Playwright does not read `.env` the way Next does, so the connection string is loaded by hand. That is also
 * why the import of `password.ts` is dynamic: it reads auth config at module load, and loading it before the
 * env exists is the trap this function would otherwise walk into.
 */
export default async function globalSetup() {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* No `.env` means the next check is the one that reports it, with a better message than ENOENT. */
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('The e2e suite needs DATABASE_URL (repo-root .env): the guard it tests requires a session.');
  }

  const { hash } = await import('../src/server/auth/password');
  const prisma = new PrismaClient();

  try {
    /* The account's primary currency is a foreign key, so it has to exist — and it must be one the Vitest
       suite never removes. That suite's teardown deletes the `TST`/`TS0` fixture currencies with a `deleteMany`,
       and `user.primary_currency_id` is RESTRICT: a browser fixture holding `TST` makes every DB spec in the
       gate fail at teardown with a foreign-key violation, which reads as twenty broken tests rather than one
       poisoned row. `E2E` is nobody else's. */
    await prisma.currency.upsert({
      where: { code: 'E2E' },
      update: {},
      create: { code: 'E2E', name: 'E2E Fixture Currency', symbol: 'E', minor_unit: 2, suffix: false },
    });

    const passwordHash = await hash(E2E_ACCOUNT.password);

    const user = await prisma.user.upsert({
      where: { email: E2E_ACCOUNT.email },
      /* `primary_currency_id` is in the update branch too: an account created by an earlier run still points at
         whatever that run used, and a fixture that only fixes itself on creation is a fixture that stays broken. */
      update: { password_hash: passwordHash, primary_currency_id: 'E2E' },
      create: {
        name: 'E2E Spec',
        email: E2E_ACCOUNT.email,
        password_hash: passwordHash,
        primary_currency_id: 'E2E',
      },
    });

    /* Sessions from a previous run would be live rows pointing at the same account. Signing in again works
       either way, but leaving them means a revoked-session bug could hide behind an older valid one. */
    await prisma.session.deleteMany({ where: { user_id: user.id } });
  } finally {
    await prisma.$disconnect();
  }
}
