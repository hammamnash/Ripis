import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthConfig } from '../src/server/auth/config';
import { hashRefreshTokenSecret, parseRefreshToken } from '../src/server/auth/refresh-token';
import { findLiveSession, rotateSession, startSession } from '../src/server/auth/session';
import {
  createTestUser,
  prisma,
  resetLedger,
  seedCurrencies,
  teardownTestData,
} from './helpers/db';

const CONFIG: AuthConfig = {
  accessSecret: 'a'.repeat(32),
  refreshSecret: 'b'.repeat(32),
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
};

let userId: string;

beforeAll(async () => {
  await seedCurrencies();
  userId = await createTestUser();
});

afterAll(async () => {
  await resetLedger(userId);
  await teardownTestData();
});

describe('a sign-in', () => {
  it('stores a hash of the refresh secret, never the secret', async () => {
    const started = await startSession(userId, CONFIG);
    const parsed = parseRefreshToken(started.refreshToken);
    expect(parsed?.sessionId).toBe(started.sessionId);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: started.sessionId } });
    expect(row.user_id).toBe(userId);
    expect(row.revoked_at).toBeNull();
    expect(row.refresh_token_hash).toBe(hashRefreshTokenSecret(parsed!.secret, CONFIG));
    expect(row.refresh_token_hash).not.toBe(started.refreshToken);
  });

  it('expires on the refresh lifetime, a fixed distance from the instant it began', async () => {
    const at = new Date('2026-10-18T00:00:00.000Z');
    const started = await startSession(userId, CONFIG, at);
    expect(started.expiresAt.toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });

  it('answers for its caller while it is live', async () => {
    const started = await startSession(userId, CONFIG);
    expect(await findLiveSession(started.sessionId)).toEqual({
      sessionId: started.sessionId,
      userId,
      role: 'user',
    });
  });
});

describe('a session that is over', () => {
  it('stops answering once it is revoked', async () => {
    const started = await startSession(userId, CONFIG);
    await prisma.session.update({
      where: { id: started.sessionId },
      data: { revoked_at: new Date() },
    });

    expect(await findLiveSession(started.sessionId)).toBeNull();
  });

  it('stops answering once its expiry has passed', async () => {
    const longAgo = new Date(Date.now() - 31 * 24 * 3_600 * 1_000);
    const started = await startSession(userId, CONFIG, longAgo);

    expect(await findLiveSession(started.sessionId)).toBeNull();
    await expect(rotateSession(started.refreshToken, CONFIG)).rejects.toMatchObject({
      code: 'invalid_refresh_token',
    });
  });

  it('never answers for a session id that was not issued', async () => {
    expect(await findLiveSession('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('rotating a refresh token', () => {
  it('replaces the secret and measures the next expiry from the rotation, not the sign-in', async () => {
    const started = await startSession(userId, CONFIG);
    const tenDaysLater = new Date(Date.now() + 10 * 24 * 3_600 * 1_000);

    const rotated = await rotateSession(started.refreshToken, CONFIG, tenDaysLater);

    expect(rotated.sessionId).toBe(started.sessionId);
    expect(rotated.userId).toBe(userId);
    expect(rotated.refreshToken).not.toBe(started.refreshToken);
    expect(rotated.expiresAt.toISOString()).toBe(
      new Date(tenDaysLater.getTime() + CONFIG.refreshTtlSeconds * 1_000).toISOString(),
    );

    const row = await prisma.session.findUniqueOrThrow({ where: { id: started.sessionId } });
    const current = parseRefreshToken(rotated.refreshToken);
    expect(row.revoked_at).toBeNull();
    expect(row.refresh_token_hash).toBe(hashRefreshTokenSecret(current!.secret, CONFIG));
  });
});
