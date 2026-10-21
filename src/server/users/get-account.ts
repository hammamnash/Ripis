import { db } from '../db';

/**
 * The account the Settings screen shows: name, email, and the primary currency the account was
 * created with.
 *
 * Read-side twin of `create-user.ts`, and deliberately not editable. ADR-0015 makes
 * `primary_currency_id` permanent — every stored figure in the ledger is denominated against it, so
 * changing it would silently re-label history — and the screen therefore *states* it rather than
 * offering a control. §7 screen 13 lists "primary currency" among its contents; this is what that
 * row reads.
 */
export interface Account {
  name: string;
  email: string;
  primaryCurrency: string;
}

export async function getAccount(userId: string): Promise<Account | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, primaryCurrency: { select: { code: true } } },
  });

  if (user === null) return null;

  return { name: user.name, email: user.email, primaryCurrency: user.primaryCurrency.code };
}
