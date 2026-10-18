import { randomBytes } from 'node:crypto';

import { writeAudited } from '../audit';
import { hash } from '../auth/password';
import { requireAdmin } from '../auth/require-admin';
import type { Caller } from '../context';
import { db } from '../db';
import { ApiError } from '../http/errors';

/**
 * An admin resetting somebody else's password (§3, §14, FR-16).
 *
 * The new password is *generated*, not supplied, and returned exactly once in this response. That is
 * what makes "the plaintext is nowhere in the database" a property rather than a promise: the hash is
 * the only thing written, and nobody — including the admin — can read the old one back out. Getting
 * another one means asking again, which is a second audited reset and a new value (ADR-0047).
 *
 * The admin may reset their own password this way. It is the only recovery path for a locked-out sole
 * admin, and it is recorded like any other reset — but note what it is not: it does not require the
 * current password, which is the difference between this route and `/auth/password`. That route stays
 * the one for people who know theirs.
 *
 * Hashing happens before the transaction opens: Argon2 takes tens of milliseconds on purpose, and
 * holding a database transaction open across it would make every reset a small outage.
 */
export interface PasswordReset {
  actor: Caller;
  userId: string;
}

/**
 * 32 characters, so `256 % 32 === 0` and the modulo below introduces no bias. The alphabet drops
 * `l`, `1`, `o` and `0`, because this value is read aloud or typed from a message by a human.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const GENERATED_LENGTH = 12;

export function generatePassword(): string {
  return Array.from(randomBytes(GENERATED_LENGTH), (byte) => ALPHABET[byte % ALPHABET.length]).join(
    '',
  );
}

export async function resetPassword(input: PasswordReset): Promise<{ password: string }> {
  requireAdmin(input.actor);

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });

  if (target === null) {
    throw new ApiError('not_found', 404, 'No such account.');
  }

  const password = generatePassword();
  const password_hash = await hash(password);

  await writeAudited({
    actor: input.actor,
    entityType: 'user',
    action: 'password_changed',
    run: async (tx) => {
      const user = await tx.user.update({
        where: { id: input.userId },
        data: { password_hash },
        select: { id: true },
      });

      return {
        written: user,
        entityId: user.id,
        after: { password_reset_by: input.actor.id },
      };
    },
  });

  return { password };
}
