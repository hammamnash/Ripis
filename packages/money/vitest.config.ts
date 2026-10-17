import { defineConfig } from "vitest/config";

/* This package's own suite. Vitest walks up the directory tree for the nearest config when a
   workspace has none, so without this file it inherits the app's include pattern from the repo
   root — which does not match `src/**` here, making every test in this package uncollectable and
   the failure look like "no test files found" rather than a missing config. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
