import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * `@ripis/money` is a workspace package rather than a dependency from the registry, and Next does not
   * compile a package under `node_modules` unless it is named here. Without this, the first screen that
   * renders an amount fails to build with a syntax error about TypeScript in a dependency — the failure
   * lands in whatever file first imports the formatter, which is a long way from the cause.
   *
   * The package is built by `prebuild`/`pretypecheck`/`pretest` (its `main` is `dist/index.js`), so this
   * covers the other half: that the compiled output is present and current before anything imports it.
   */
  transpilePackages: ["@ripis/money"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
