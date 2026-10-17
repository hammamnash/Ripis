import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Phase 1's specs talk to a real PostgreSQL: the claims are about constraints the database
 * enforces (ADR-0012), so a mock would assert nothing.
 *
 * Next loads `.env` for the app on its own; Vitest loads no dotenv at all, hence this loader. It
 * reads `DATABASE_URL` out of the nearest `.env` rather than importing a dependency for four lines
 * of parsing, and it searches upward so the suite behaves the same whether it is started from the
 * repo root or from a subdirectory.
 */
function loadEnv(): Record<string, string> {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')];
  const found = candidates.find(
    (path) => existsSync(path) && readFileSync(path, 'utf8').includes('DATABASE_URL='),
  );
  if (!found) return {};

  return Object.fromEntries(
    readFileSync(found, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

export default defineConfig({
  test: {
    environment: 'node',
    /*
     * Every spec file talks to the SAME local database, and reference data (`currency`) is seeded
     * and torn down per file. In parallel, one file's teardown deletes the `TST` currency while a
     * sibling is still using it — observed as an FK violation on `user_primary_currency_id_fkey`
     * in one file and a unique-constraint race in the other. Files therefore run one at a time;
     * this suite is I/O-bound and small, so the serial cost is negligible.
     */
    fileParallelism: false,
    /*
     * Named explicitly rather than left to the default `**\/*.{test,spec}.*`, which would also walk
     * `.next` — a full copy of the compiled app. Both extensions are listed because the database
     * specs end `.spec.ts` while the unit specs end `.test.ts`, and `components/` is here so a
     * component test cannot be silently uncollectable.
     */
    include: ['{app,src,test,components}/**/*.{test,spec}.{ts,tsx}'],
    env: loadEnv(),
  },
});
