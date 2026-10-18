import { SignJWT, jwtVerify } from 'jose';

import type { AuthConfig } from './config';

/**
 * The access token proves *which session* is calling, and nothing else.
 *
 * It deliberately carries no role: every request already reads the session row (ADR-0040 — sign-out must
 * refuse an unexpired token), and the row joins to the user, so the role comes from the database on each
 * request. A role inside the token would be a second, staler copy of the same fact, and a demotion would
 * not take effect until the token expired.
 *
 * What the token is not: proof of anything by itself. `src/server/auth/session.ts` resolves the session
 * it names, and a revoked session refuses the request however valid the signature is.
 */
export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

/** Pinned so a token minted for another application with the same key is not mistaken for ours. */
export const ACCESS_TOKEN_ISSUER = 'ripis';

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** `at` is a parameter so a spec can mint an already-expired token instead of waiting for one. */
export async function signAccessToken(
  claims: AccessTokenClaims,
  config: AuthConfig,
  at: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(at.getTime() / 1_000);

  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + config.accessTtlSeconds)
    .sign(keyOf(config.accessSecret));
}

/**
 * Answers `null` for every rejection — expired, foreign issuer, wrong key, altered payload, absent
 * identity, not a token at all. The caller has exactly one response to all of them ("sign in again"),
 * and collapsing them here keeps a signature check from being mistaken for a live session.
 */
export async function verifyAccessToken(
  token: string,
  config: AuthConfig,
): Promise<AccessTokenClaims | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, keyOf(config.accessSecret), {
      issuer: ACCESS_TOKEN_ISSUER,
      algorithms: ['HS256'],
    });

    const { sub, sid } = payload as { sub?: unknown; sid?: unknown };

    if (typeof sub !== 'string' || typeof sid !== 'string' || sub === '' || sid === '') {
      return null;
    }

    return { userId: sub, sessionId: sid };
  } catch {
    return null;
  }
}
