import { writeAudited } from '../audit';
import { hash } from '../auth/password';
import { assertPasswordIsLongEnough } from '../auth/password-policy';
import { requireAdmin } from '../auth/require-admin';
import type { Caller } from '../context';
import { db } from '../db';
import { normaliseEmail } from '../email';
import { ApiError } from '../http/errors';

/**
 * An admin creating an account (FR-16, ADR-0013).
 *
 * The role is not a parameter. ADR-0013 makes the single admin a seed-time fact from `.env`, and a
 * request body that could mint another one would make that decision reversible by whoever holds one
 * admin session — so every account this creates is an ordinary user, and the body cannot say otherwise.
 *
 * `primary_currency_id` is required rather than defaulted, because ADR-0015 makes it permanent: a wrong
 * choice can only be repaired by a new account and a re-import. The caller states it, and a code no
 * currency matches is a 400 with the field named — not a foreign-key failure rendered as a 500.
 *
 * The write and its audit row are one transaction (`writeAudited`), so the account and the record of who
 * created it cannot disagree. The row lives in the *admin's* ledger with `entity_id` naming the new
 * account (ADR-0046), and it carries no password material of any kind (ADR-0047).
 */
export interface NewUser {
  actor: Caller;
  name: string;
  email: string;
  password: string;
  primaryCurrencyId: string;
}

export async function createUser(input: NewUser): Promise<{ id: string }> {
  requireAdmin(input.actor);
  assertPasswordIsLongEnough(input.password, 'password');

  // Folded to lowercase before both the uniqueness check and the write, so the check and the constraint
  // agree — see `email.ts`. The check happens first so a duplicate is a 409 naming the field rather than
  // a unique-violation rendered as a 500.
  const email = normaliseEmail(input.email);

  const currency = await db.currency.findUnique({ where: { code: input.primaryCurrencyId } });
  if (currency === null) {
    throw new ApiError(
      'validation_failed',
      400,
      'That is not a currency this app knows.',
      'primaryCurrencyId',
    );
  }

  if ((await db.user.findUnique({ where: { email } })) !== null) {
    throw new ApiError('email_taken', 409, 'That email already has an account.', 'email');
  }

  const password_hash = await hash(input.password);

  const created = await writeAudited({
    actor: input.actor,
    entityType: 'user',
    action: 'created',
    run: async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email,
          password_hash,
          primary_currency_id: input.primaryCurrencyId,
          role: 'user',
        },
        select: { id: true, name: true, email: true, role: true, primary_currency_id: true },
      });

      return {
        written: user,
        entityId: user.id,
        after: {
          name: user.name,
          email: user.email,
          role: user.role,
          primary_currency_id: user.primary_currency_id,
        },
      };
    },
  });

  return { id: created.id };
}
