import { defineConfig } from '@playwright/test';

/**
 * The browser harness Task 7.2 promised and the mockup probes stood in for. It lives outside
 * `npm run gate` on purpose: the gate must stay runnable without a built app or a browser.
 *
 * `e2e/` sits at the repo root, which is outside Vitest's `include`
 * (`{app,src,test,components}/**\/*.{test,spec}.{ts,tsx}`). A Playwright spec dropped into any of
 * those four directories would be collected by `npm test` and fail there instead.
 *
 * Today the suite reads `/probe` only — a static fixture page, no session and no database. When
 * 7.4's screens land and these specs need a signed-in ledger, that is when `DATABASE_URL` becomes a
 * prerequisite; claiming it now would be describing a suite that does not exist yet.
 *
 * Chromium is the only browser. §9's claims are about a phone viewport and a 44px thumb target, so
 * WebKit's different `env(safe-area-inset-*)` behaviour would test a device the app does not target.
 */
export default defineConfig({
  testDir: './e2e',
  /* Serial because the assertions are cheap and a single browser keeps the failure output readable;
     there is no shared database to serialise for at this point. */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.RIPIS_E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    /* §9: 44px targets and no clipping at 320px. 430×932 is the reference phone the design was
       drawn against; `devices['Pixel 7']` would add a device scale factor the assertions do not
       need. */
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  /* Channel `chrome`, not Playwright's bundled Chromium: this machine already has Google Chrome, so
     the harness runs without a ~150MB browser download per Playwright upgrade. The assertions are
     about computed colour and geometry, which every Chromium build answers identically. */
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } }],

  /* Port 3100, not 3000: a `next dev` the developer already has open must not be mistaken for the
     build under test, and the reuse-existing flag is deliberately absent for the same reason — a
     stale server serving stale CSS is exactly the failure this harness exists to catch. */
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
