import { expect, test } from '@playwright/test';

import { E2E_ACCOUNT, E2E_STORAGE_STATE, signInThroughForm } from './helpers';

/*
 * The guard, from the outside (Task 7.4).
 *
 * `test/screen-session.spec.ts` proves what the guard *decides* against real session rows; this proves the
 * two things only a browser can: that a missing or junk cookie produces a redirect rather than a rendered
 * frame or a 500, and that the sign-in screen is reachable and works.
 *
 * Every test in this file starts from an empty cookie jar. The `chromium` project hands specs a signed-in
 * state by default, so the empty override is the whole point of these cases.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test('a browser with no session lands on the sign-in screen, not on a tapped-out tab bar', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/sign-in');
  await expect(page.getByRole('heading', { name: 'Ripis' })).toBeVisible();
  /* The frame must not have rendered behind the redirect: a visible tab bar here would mean the guard ran
     after the shell, which is the version of this bug a user would see as a flash of the app. */
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
});

test('every tab is guarded, including the ones with no data of their own', async ({ page }) => {
  for (const path of ['/transactions', '/budgets', '/wallets', '/settings']) {
    await page.goto(path);
    await expect(page, path).toHaveURL('/sign-in');
  }
});

test('a junk session cookie is treated as no session rather than as an error', async ({ page, context }) => {
  /* A cookie the app could never have issued. It must resolve to "not signed in": the id is a Postgres
     uuid, so an unvalidated value reaches Prisma as a type error and the frame would answer 500. */
  await context.addCookies([
    { name: 'ripis_session', value: 'not-a-session-id', url: 'http://127.0.0.1:3100' },
  ]);

  const response = await page.goto('/');

  await expect(page).toHaveURL('/sign-in');
  expect(response?.status()).toBe(200);
});

test('a wrong password states the cause and stays on the screen', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(E2E_ACCOUNT.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  /* `role="alert"` is not unique on the page: Next's own route announcer carries it. The testid is the
     form's error, and the only one a person can see. */
  await expect(page.getByTestId('sign-in-error')).toContainText('do not match');
  await expect(page).toHaveURL('/sign-in');
});

test.describe('once signed in', () => {
  test.use({ storageState: E2E_STORAGE_STATE });

  test('signing out from Settings revokes the browser session and returns to sign-in', async ({ page }) => {
    await page.context().clearCookies();
    await signInThroughForm(page);
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByRole('heading', { name: 'Ripis' })).toBeVisible();

    await page.goto('/settings');
    await expect(page).toHaveURL('/sign-in');
  });

  test('the form is not a second entry point into a live session', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page).toHaveURL('/');
  });

  test('signing in opens the ledger', async ({ page }) => {
    /* The context starts from the saved jar, so the form would be behind a redirect. Signing out first is
       what makes this the whole journey rather than an assertion about a cookie that already existed. */
    await page.context().clearCookies();

    await signInThroughForm(page);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
