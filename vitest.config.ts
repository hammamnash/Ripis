import { defineConfig } from "vitest/config";

/* Vitest's default exclude list covers node_modules and dist but not .next, and .next holds a full
   copy of the compiled app. Pin the scan to the source trees so the suite can't walk build output.

   These four directories are exhaustive on purpose: an `include` that misses a tree makes that
   tree's tests uncollectable and silent, and Vitest walks UP to this config for any workspace that
   has none of its own — which is how packages/money's suite went to zero tests. Anything added
   outside them needs a pattern here (or its own config).

   The app needs no swc/esbuild plugin for decorator metadata (ADR-0035): that requirement left with
   NestJS, and nothing in the app uses decorators. */
export default defineConfig({
  test: {
    include: ["{app,src,test,components}/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
