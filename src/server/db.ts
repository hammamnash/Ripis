import { PrismaClient } from '@prisma/client';

import { scopedPrisma } from './prisma-user-scope';

/**
 * The one database handle the application uses, and the scope extension already applied (ADR-0020).
 *
 * Both halves of that sentence are the point. Applying the extension here rather than in each
 * service means a service cannot reach an unscoped client by accident, because there is no
 * unscoped client to import (ADR-0039 — the module boundary is enforced by what exists, not by a
 * rule in a document).
 *
 * The client is cached on `globalThis` outside production because Next re-evaluates modules on
 * every hot reload in development, and a connection pool per reload exhausts PostgreSQL's
 * `max_connections` — the failure arrives later, as a connection error in an unrelated request.
 */
const globalForPrisma = globalThis as unknown as { ripisPrismaClient?: PrismaClient };

const client = globalForPrisma.ripisPrismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.ripisPrismaClient = client;
}

export const db = scopedPrisma(client);
