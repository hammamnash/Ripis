import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthConfig } from '../src/server/auth/config';
import {
  findLiveSession,
  revokeSessionByRefreshToken,
  rotateSession,
  startSession,
} from '../src/server/auth/session';
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

describe('a refresh token that was already spent', () => {
  it('is refused, and it takes the session down with it', async () => {
    const started = await startSession(userId, CONFIG);
    const rotated = await rotateSession(started.refreshToken, CONFIG);

    await expect(rotateSession(started.refreshToken, CONFIG)).rejects.toMatchObject({
      code: 'invalid_refresh_token',
      status: 401,
    });

    const row = await prisma.session.findUniqueOrThrow({ where: { id: started.sessionId } });
    expect(row.revoked_at).not.toBeNull();

    // The token handed out a moment ago belongs to a session that no longer exists, and rotation
    // cannot revive it: a client holding a spent token and one holding the current one are
    // indistinguishable, so both are refused (ADR-0040).
    await expect(rotateSession(rotated.refreshToken, CONFIG)).rejects.toMatchObject({
      code: 'invalid_refresh_token',
    });
  });
});

describe('signing out', () => {
  it('kills the session whose current refresh token is presented', async () => {
    const started = await startSession(userId, CONFIG);

    await expect(revokeSessionByRefreshToken(started.refreshToken, CONFIG)).resolves.toEqual({
      sessionId: started.sessionId,
      userId,
    });
    expect(await findLiveSession(started.sessionId)).toBeNull();
  });

  it('is idempotent — presenting the same token twice is not an error', async () => {
    const started = await startSession(userId, CONFIG);
    await revokeSessionByRefreshToken(started.refreshToken, CONFIG);

    await expect(revokeSessionByRefreshToken(started.refreshToken, CONFIG)).resolves.toEqual({
      sessionId: started.sessionId,
      userId,
    });
  });

  it('refuses a token that is no longer current, and leaves the live session alone', async () => {
    const started = await startSession(userId, CONFIG);
    const rotated = await rotateSession(started.refreshToken, CONFIG);

    await expect(revokeSessionByRefreshToken(started.refreshToken, CONFIG)).rejects.toMatchObject({
      code: 'invalid_refresh_token',
    });
    expect(await findLiveSession(started.sessionId)).not.toBeNull();

    // while the client holding the current token can still sign out
    await expect(revokeSessionByRefreshToken(rotated.refreshToken, CONFIG)).resolves.toEqual({
      sessionId: started.sessionId,
      userId,
    });
  });

  it('refuses what is not a refresh token at all', async () => {
    for (const rubbish of ['', 'nonsense', 'not-a-uuid.secret', '.secret']) {
      await expect(revokeSessionByRefreshToken(rubbish, CONFIG)).rejects.toMatchObject({
        code: 'invalid_refresh_token',
      });
    }
  });

  it('refuses a well-formed token for a session that was never issued', async () => {
    const neverIssued = `00000000-0000-4000-8000-000000000000.${'a'.repeat(43)}`;

    await expect(revokeSessionByRefreshToken(neverIssued, CONFIG)).rejects.toMatchObject({
      code: 'invalid_refresh_token',
    });
  });
});
