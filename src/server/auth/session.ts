import { randomUUID } from 'node:crypto';

import type { Role } from '@prisma/client';

import { db } from '../db';
import { ApiError } from '../http/errors';
import type { AuthConfig } from './config';
import { issueRefreshToken, parseRefreshToken, refreshTokenMatches } from './refresh-token';

export interface StartedSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface RotatedSession extends StartedSession {
  userId: string;
}

export interface LiveSession {
  sessionId: string;
  userId: string;
  role: Role;
}

/**
 * The session table, and nothing else.
 *
 * This module is the only thing that reads `session`, which is why the table is not user-scoped in
 * `src/server/prisma-user-scope.ts`: a session is looked up *before* there is a caller to scope it to,
 * because finding the caller is what the lookup is for (same reasoning as `User` itself).
 *
 * Every refusal is one code with one message. A refresh token that was never issued, one that was
 * issued and spent, one belonging to a revoked session and one belonging to an expired session are
 * indistinguishable to the client — the only difference is written to the row, not to the response.
 *
 * Times are arguments, not `new Date()` calls buried in the middle, so the specs can put a session in
 * the past without waiting for one.
 */

const REFUSAL_MESSAGE = 'That refresh token is no longer valid.';

function refusal(): ApiError {
  return new ApiError('invalid_refresh_token', 401, REFUSAL_MESSAGE);
}

function expiryFrom(at: Date, config: AuthConfig): Date {
  return new Date(at.getTime() + config.refreshTtlSeconds * 1_000);
}

async function revokeSession(sessionId: string, at: Date): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revoked_at: null },
    data: { revoked_at: at },
  });
}

export async function startSession(
  userId: string,
  config: AuthConfig,
  at: Date = new Date(),
): Promise<StartedSession> {
  const sessionId = randomUUID();
  const issued = issueRefreshToken(sessionId, config);
  const expiresAt = expiryFrom(at, config);

  await db.session.create({
    data: {
      id: sessionId,
      user_id: userId,
      refresh_token_hash: issued.hash,
      expires_at: expiresAt,
    },
  });

  return { sessionId, refreshToken: issued.token, expiresAt };
}

export async function findLiveSession(
  sessionId: string,
  at: Date = new Date(),
): Promise<LiveSession | null> {
  const session = await db.session.findFirst({
    where: { id: sessionId, revoked_at: null, expires_at: { gt: at } },
    select: { id: true, user_id: true, user: { select: { role: true } } },
  });

  if (session === null) return null;

  return { sessionId: session.id, userId: session.user_id, role: session.user.role };
}

export async function rotateSession(
  refreshToken: string,
  config: AuthConfig,
  at: Date = new Date(),
): Promise<RotatedSession> {
  const presented = parseRefreshToken(refreshToken);
  if (presented === null) throw refusal();

  const session = await db.session.findUnique({
    where: { id: presented.sessionId },
    select: {
      id: true,
      user_id: true,
      refresh_token_hash: true,
      revoked_at: true,
      expires_at: true,
    },
  });
  if (session === null) throw refusal();
  if (session.revoked_at !== null || session.expires_at <= at) throw refusal();

  if (!refreshTokenMatches(presented.secret, session.refresh_token_hash, config)) {
    // A token that was already spent. Either this client raced itself or somebody else holds a copy,
    // and the two are indistinguishable — so the session dies here rather than in fifteen minutes
    // (ADR-0040). This is the whole reason rotation is worth its complexity.
    await revokeSession(session.id, at);
    throw refusal();
  }

  const issued = issueRefreshToken(session.id, config);
  const expiresAt = expiryFrom(at, config);

  await db.session.update({
    where: { id: session.id },
    data: { refresh_token_hash: issued.hash, expires_at: expiresAt },
  });

  return { sessionId: session.id, userId: session.user_id, refreshToken: issued.token, expiresAt };
}

export async function revokeSessionBySessionId(sessionId: string, at: Date = new Date()): Promise<void> {
  await revokeSession(sessionId, at);
}

export async function revokeSessionByRefreshToken(
  refreshToken: string,
  config: AuthConfig,
  at: Date = new Date(),
): Promise<{ sessionId: string; userId: string }> {
  const presented = parseRefreshToken(refreshToken);
  if (presented === null) throw refusal();

  const session = await db.session.findUnique({
    where: { id: presented.sessionId },
    select: {
      id: true,
      user_id: true,
      refresh_token_hash: true,
      revoked_at: true,
      expires_at: true,
    },
  });
  if (session === null) throw refusal();

  // Signing out of a session that is already over is not an error: the caller wanted it dead, and it
  // is dead. Refusing here would make a retried sign-out look like a failure to the client.
  if (session.revoked_at !== null || session.expires_at <= at) {
    return { sessionId: session.id, userId: session.user_id };
  }

  // Only the holder of the session's *current* refresh token may end it. A spent one must not, or
  // whoever kept an old copy could sign the real client out — a nuisance rather than a breach, but
  // not theirs to cause.
  if (!refreshTokenMatches(presented.secret, session.refresh_token_hash, config)) throw refusal();

  await revokeSession(session.id, at);

  return { sessionId: session.id, userId: session.user_id };
}
