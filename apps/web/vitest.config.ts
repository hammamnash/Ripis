import { defineConfig } from "vitest/config";

/* Vitest's default exclude list covers node_modules and dist but not .next, and .next holds a full
   copy of the compiled app. Pin the scan to the test directory so the suite can't walk build output.
   No swc/esbuild plugin here: apps/web has no decorators, so vitest's own transform is enough. */
export default defineConfig({
  test: {
    include: ["app/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
