import { PrismaClient } from '@prisma/client';

import { seedAdmin, seedReferenceCurrencies } from './seed';

/**
 * Entry point for `npm run db:seed`, and for `prisma db seed`.
 *
 * There is no boot hook (ADR-0039): this runs at deploy time, by hand. Re-running is safe —
 * `seedReferenceCurrencies` leaves an existing row exactly as it is, and `seedAdmin` hashes the
 * password only when it creates the row (ADR-0019).
 *
 * Order matters, and it is the whole reason this file exists separately: `User.primary_currency_id`
 * is a foreign key, so the reference currencies must exist before the account that points at one
 * can be created.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const currencies = await seedReferenceCurrencies(prisma);
    const admin = await seedAdmin(prisma);

    console.log(`seeded ${currencies} reference currencies; admin ready: ${admin.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
