import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
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
