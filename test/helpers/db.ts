import { PrismaClient } from '@prisma/client';

/**
 * Phase 1's specs talk to the real database, because what they assert is what PostgreSQL
 * enforces: a mock would assert that our mock works. The connection string arrives through
 * `process.env.DATABASE_URL`, which `vitest.config.ts` loads from the repo-root `.env` — Vitest
 * itself reads no dotenv file.
 */
export const prisma = new PrismaClient();

export const CURRENCIES = {
  /** Two decimal places and a leading mark, like USD. */
  base: { code: 'TST', name: 'Test Currency', symbol: 'T', minor_unit: 2, suffix: false },
  /** Zero decimal places, like IDR (ADR-0003). */
  zeroDecimal: {
    code: 'TS0',
    name: 'Test Zero-Decimal Currency',
    symbol: 'Z',
    minor_unit: 0,
    suffix: false,
  },
} as const;

export const TEST_EMAIL = 'phase-1-spec@ripis.test';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. The suite runs against the real database; vitest.config.ts loads it ' +
      'from the repo-root .env.',
  );
}

export async function seedCurrencies(): Promise<void> {
  for (const currency of Object.values(CURRENCIES)) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: { ...currency },
    });
  }
}

/**
 * Runs a write that is EXPECTED to be refused and returns the Prisma error code, or `undefined`
 * if the write went through. Inline `promise.catch(...)` widening is what made these specs fail
 * `tsc` while Vitest stayed green: SWC transpiles without typechecking.
 */
export async function codeOfRefusal(write: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await write();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

export async function createTestUser(): Promise<string> {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

  const user = await prisma.user.create({
    data: {
      name: 'Phase 1 Spec',
      email: TEST_EMAIL,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });

  return user.id;
}

/**
 * Wipes one test ledger. Required relations restrict deletion, so children come before parents —
 * and this list grows with Phase 1 rather than naming tables that do not exist yet, which is what
 * an undefined `prisma.budget` at Task 1.2 looked like.
 */
export async function resetLedger(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { user_id: userId } });
  await prisma.budget.deleteMany({ where: { user_id: userId } });
  await prisma.transaction.deleteMany({ where: { user_id: userId } });
  await prisma.category.deleteMany({ where: { user_id: userId } });
  await prisma.wallet.deleteMany({ where: { user_id: userId } });
  await prisma.auditLog.deleteMany({ where: { user_id: userId } });
}

export async function teardownTestData(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: TEST_EMAIL },
    select: { id: true },
  });

  for (const user of users) {
    await resetLedger(user.id);
  }

  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.currency.deleteMany({
    where: { code: { in: Object.values(CURRENCIES).map((currency) => currency.code) } },
  });
  await prisma.$disconnect();
}

export interface ColumnSpec {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

/**
 * Reads what the database actually built, rather than trusting the schema that asked for it.
 *
 * An empty answer is an ERROR, not an empty list: a table this schema declares always has columns,
 * so no columns means the table is not there. Without this guard every "column X does not exist"
 * assertion in these specs would pass vacuously against a table that was never created — which is
 * exactly what the Task 1.5 RED run caught `has no deleted_at` doing.
 */
export async function columnsOf(table: string): Promise<ColumnSpec[]> {
  const columns = await prisma.$queryRaw<ColumnSpec[]>`
    SELECT column_name, data_type, is_nullable, column_default, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY column_name
  `;

  if (columns.length === 0) {
    throw new Error(`No columns for table "${table}" — the table does not exist.`);
  }

  return columns;
}

/** Same reasoning as `columnsOf`: every table has a primary key index, so empty means absent. */
export async function indexesOf(table: string): Promise<{ indexdef: string }[]> {
  const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}
  `;

  if (indexes.length === 0) {
    throw new Error(`No indexes for table "${table}" — the table does not exist.`);
  }

  return indexes;
}
