import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  /* The application is the repo root (ADR-0039), so this config now sweeps the whole repository rather
     than one workspace — which is why the ignore list is explicit. Three things are excluded on purpose:
     build output (`dist/`, `.next/`, compiled CommonJS that is never read as source); `mockups/`, which
     holds the pre-implementation HTML/JS prototypes rather than application code; and `next-env.d.ts`,
     which Next generates. Everything else — `app/`, `src/`, `packages/`, `test/`, `scripts/` — is linted. */
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output is emitted, not authored.
    "dist/**",
    "**/dist/**",
    "coverage/**",
    // Pre-implementation prototypes: fake data, no application behaviour.
    "mockups/**",
  ]),
]);

export default eslintConfig;
