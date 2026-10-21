import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { E2E_ACCOUNT } from "./helpers";
import { verify } from "../src/server/auth/password";

/*
 * §7 screen 13, Task 7.4g: the account rows, and the password change as a person reaches it.
 *
 * The change runs against the shared fixture account and reverses itself at the end — not decoration:
 * `global-setup.ts` re-hashes this account's password at every suite run, and a change left un-reversed
 * would sit wrong until the next one. Reversing through the *screen* is deliberate too: the browser
 * context holds the session that submitted, ADR-0045 keeps exactly that one alive, so the storage state
 * the sibling specs reuse stays a live session throughout.
 *
 * The proof reads the stored hash rather than signing in again: the suite shares five logins per account
 * per minute (ADR-0044), `auth.spec.ts` spends them inside the same window, and a screen test that loses
 * that race fails for a reason that has nothing to do with passwords. Whether the new password *works*
 * at the door is proven in `test/auth-password.spec.ts` against the real route; what is proven here is
 * that the screen's submit rewrote the row — which the hash comparison states exactly.
 */

const prisma = new PrismaClient();
const TEMPORARY = "e2e-temp-password-2";

/** Submit the whole form: React resets an uncontrolled form after each server action. */
async function fillPasswordForm(page: Page, current: string, fresh: string, confirm: string) {
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(fresh);
  await page.getByLabel("Confirm new password").fill(confirm);
  await page.getByRole("button", { name: "Change password" }).click();
}

async function storedHash(): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: E2E_ACCOUNT.email },
    select: { password_hash: true },
  });
  return user.password_hash;
}

test("Settings states the account and changes the password, keeping this session alive", async ({
  page,
}) => {
  await page.goto("/settings");

  await expect(page.getByTestId("account-email")).toHaveText(E2E_ACCOUNT.email);
  // The fixture account's primary currency, per `global-setup.ts`.
  await expect(page.getByTestId("account-currency")).toHaveText("E2E");

  /* A mistyped confirmation must change nothing: the two fields never reached the server. */
  await fillPasswordForm(page, E2E_ACCOUNT.password, TEMPORARY, "typo-does-not-match-2");
  await expect(page.getByTestId("password-error")).toContainText("do not match");
  expect(await verify(await storedHash(), E2E_ACCOUNT.password)).toBe(true);

  /* The real change, through the screen. Every submit refills all three fields: React resets an
     uncontrolled form after a server action, and the `required` inputs would otherwise block the next
     submit natively before the action ever ran. */
  await fillPasswordForm(page, E2E_ACCOUNT.password, TEMPORARY, TEMPORARY);
  await expect(page.getByTestId("password-changed")).toBeVisible();

  /* The row is the evidence: the new hash verifies against the temporary password and not the old one. */
  const after = await storedHash();
  expect(await verify(after, TEMPORARY)).toBe(true);
  expect(await verify(after, E2E_ACCOUNT.password)).toBe(false);

  /* ADR-0045's promise: the session that submitted survives, so this screen is still the user's. */
  await page.reload();
  await expect(page.getByTestId("settings-account")).toBeVisible();

  /* Reverse, through the same screen, leaving the account and the storage state as they were found. */
  await fillPasswordForm(page, TEMPORARY, E2E_ACCOUNT.password, E2E_ACCOUNT.password);
  await expect(page.getByTestId("password-changed")).toBeVisible();
  expect(await verify(await storedHash(), E2E_ACCOUNT.password)).toBe(true);
});
