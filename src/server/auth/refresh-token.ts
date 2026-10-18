import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { AuthConfig } from './config';

/**
 * The refresh token is opaque, not a JWT, and it names its own session.
 *
 * `<sessionId>.<secret>` is what makes rotation checkable: the session is found by the id it carries, and
 * the secret is then compared against the digest stored on that row. A token that no longer matches a
 * live row is either stale (the client raced a rotation) or stolen (the row was rotated by somebody else),
 * and a JWT refresh token could not tell those apart without extra state.
 *
 * The digest is HMAC-SHA256, not Argon2id, and that is not a shortcut: a password is low-entropy and needs
 * a work factor, while this secret is 256 random bits, so there is nothing to slow an attacker down to.
 * `JWT_REFRESH_SECRET` is the HMAC key, which is the job that keeps that variable honest — the two secrets
 * in `.env` do different things (see ADR-0042).
 */
export interface IssuedRefreshToken {
  /** The value the client holds. Never stored. */
  token: string;
  /** The part that is hashed. */
  secret: string;
  /** What goes on the session row. */
  hash: string;
}

export interface ParsedRefreshToken {
  sessionId: string;
  secret: string;
}

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 32 random bytes in base64url: 43 characters, none of them padding. */
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function issueRefreshToken(sessionId: string, config: AuthConfig): IssuedRefreshToken {
  const secret = randomBytes(32).toString('base64url');

  return { token: `${sessionId}.${secret}`, secret, hash: hashRefreshTokenSecret(secret, config) };
}

export function parseRefreshToken(token: string): ParsedRefreshToken | null {
  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [sessionId, secret] = parts as [string, string];

  if (!SESSION_ID_PATTERN.test(sessionId) || !SECRET_PATTERN.test(secret)) {
    return null;
  }

  return { sessionId, secret };
}

export function hashRefreshTokenSecret(secret: string, config: AuthConfig): string {
  return createHmac('sha256', config.refreshSecret).update(secret).digest('hex');
}

/** Constant-time, because a digest comparison that returns early leaks how much of a guess was right. */
export function refreshTokenMatches(secret: string, storedHash: string, config: AuthConfig): boolean {
  const presented = Buffer.from(hashRefreshTokenSecret(secret, config), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
