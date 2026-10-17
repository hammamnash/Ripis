import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Phase 1's specs talk to a real PostgreSQL: the claims are about constraints the database
 * enforces (ADR-0012), so a mock would assert nothing. The Prisma CLI reads the repo-root
 * `.env` on its own because it is always run from the root, but Vitest loads no dotenv at
 * all — hence this loader. It searches upward from the workspace so the suite behaves the
 * same whether it is run by `npm run gate` or by hand from `apps/api`.
 */
function loadRootEnv(): Record<string, string> {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(process.cwd(), '../.env'),
  ];
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

/**
 * Why `@swc/core` sits in this config at all (ADR-0035):
 * Vitest transpiles with esbuild, and esbuild does **not** emit decorator metadata.
 * Without the metadata, `@nestjs/testing` cannot resolve constructor dependencies and
 * the e2e suite fails with an injector error rather than an honest test result.
 * The SWC transform below is the documented remedy; `decoratorMetadata: true` is the
 * line that matters. Do not delete it to "simplify" the config.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // `test/**/*.spec.ts` is a separate pattern from `*.e2e-spec.ts` — the plan names the
    // database-constraint suites `schema.spec.ts`, and `-spec` is not `.spec`, so nothing
    // is collected twice.
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts', 'test/**/*.spec.ts'],
    env: loadRootEnv(),
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
