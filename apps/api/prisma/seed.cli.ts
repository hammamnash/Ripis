import { PrismaClient } from '@prisma/client';

import { seedAdmin, seedReferenceCurrencies } from './seed';

/**
 * Entry point for `prisma db seed` and for a manual first boot.
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
