import { test as setup } from '@playwright/test';

import { E2E_STORAGE_STATE, signInThroughForm } from './helpers';

/**
 * Signs in once and saves the cookie jar for every other spec.
 *
 * Once, rather than once per test, for a reason that is not speed: `POST /api/auth/login` counts attempts
 * per address, and the suite is eleven specs deep. A `beforeEach` would spend eleven of the minute's budget
 * on a limit that is working correctly, and the failure would read as "the rate limiter is broken".
 *
 * The account is created by `global-setup.ts` before this runs — Playwright guarantees `globalSetup` finishes
 * first. The saved state holds `ripis_session`, which is httpOnly and therefore invisible to the specs; they
 * only ever pass it back to the browser.
 */
setup('sign in through the form and keep the session', async ({ page }) => {
  await signInThroughForm(page);

  /* Landing on `/` is the assertion, and it is a real one: the guard accepted what the login route set. */
  await page.context().storageState({ path: E2E_STORAGE_STATE });
});
