import { writeAudit } from '../audit';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { hash, verify } from './password';
import { MIN_PASSWORD_LENGTH } from './password-policy';

/**
 * Changing your own password, with the current one required.
 *
 * The account is the one the token named, never one the body asked for: no route in this API accepts
 * a `user_id` (`02-context.md` §6.1), and this is the route where getting that wrong would matter most.
 *
 * A change also ends **every other session of the account** and keeps the one that made it (ADR-0045).
 * The reasoning is the reason someone changes a password in a hurry: if it is because somebody else may
 * have it, leaving their session alive makes the change pointless — a revoked credential that is still
 * signed in. The session that asked is kept because signing yourself out of the device you are holding
 * would not be a security measure, just a surprise.
 */

/** Kept here because the route and its spec already name it; the value lives in `password-policy.ts`. */
export { MIN_PASSWORD_LENGTH };

export interface PasswordChange {
  userId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(change: PasswordChange): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: change.userId },
    select: { id: true, role: true, password_hash: true },
  });

  if (user === null) throw new ApiError('unauthenticated', 401, 'Sign in to continue.');

  if (change.newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(
      'validation_failed',
      400,
      `A password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      'newPassword',
    );
  }

  if (!(await verify(user.password_hash, change.currentPassword))) {
    throw new ApiError(
      'current_password_incorrect',
      401,
      'That is not your current password.',
      'currentPassword',
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { password_hash: await hash(change.newPassword) },
  });

  await db.session.updateMany({
    where: {
      user_id: user.id,
      revoked_at: null,
      id: { not: change.currentSessionId },
    },
    data: { revoked_at: new Date() },
  });

  await writeAudit({
    actor: { id: user.id, role: user.role },
    userId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'password_changed',
  });
}
