import { randomBytes } from 'node:crypto';

import type { Role } from '@prisma/client';

import { writeAudit } from '../audit';
import { db } from '../db';
import { normaliseEmail } from '../email';
import { ApiError } from '../http/errors';
import type { AuthConfig } from './config';
import { signAccessToken } from './jwt';
import { hash, verify } from './password';
import { startSession } from './session';

/**
 * The only place a password is checked, and the only place a sign-in is recorded.
 *
 * Two refusals look identical to the client — the same status, the same code, the same sentence — and
 * deliberately so: an endpoint that says "no such account" for one address and "wrong password" for
 * another has published the list of addresses that exist.
 *
 * The same reasoning covers time. An address with no account still pays for an Argon2id verification
 * against a digest of a throwaway secret, so the response takes as long as a wrong password does.
 * Without that, the speed of the answer is the oracle the message is not.
 */

const absentAccountHash: Promise<string> = hash(randomBytes(32).toString('base64url'));

export interface SignedInUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  primaryCurrencyId: string;
}

export interface SignInResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SignedInUser;
}

function invalidCredentials(): ApiError {
  return new ApiError('invalid_credentials', 401, 'That email and password do not match.');
}

export async function signIn(
  submittedEmail: string,
  submittedPassword: string,
  config: AuthConfig,
): Promise<SignInResult> {
  const user = await db.user.findUnique({ where: { email: normaliseEmail(submittedEmail) } });

  if (user === null) {
    await verify(await absentAccountHash, submittedPassword);

    // Nothing is audited on this path, and that is a limit rather than a choice: `audit_log` is a row
    // about an account, and there is no account here to write it against.
    throw invalidCredentials();
  }

  const actor = { id: user.id, role: user.role };

  if (!(await verify(user.password_hash, submittedPassword))) {
    await writeAudit({ actor, userId: user.id, entityType: 'auth', action: 'auth_failed' });
    throw invalidCredentials();
  }

  const session = await startSession(user.id, config);
  const accessToken = await signAccessToken({ userId: user.id, sessionId: session.sessionId }, config);

  await writeAudit({ actor, userId: user.id, entityType: 'auth', action: 'signed_in' });

  return {
    accessToken,
    refreshToken: session.refreshToken,
    expiresIn: config.accessTtlSeconds,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      primaryCurrencyId: user.primary_currency_id,
    },
  };
}
