import { describe, expect, it } from 'vitest';

import type { AuthConfig } from './config';
import { hashRefreshTokenSecret, issueRefreshToken, parseRefreshToken } from './refresh-token';

const CONFIG: AuthConfig = {
  accessSecret: 'a'.repeat(64),
  refreshSecret: 'b'.repeat(64),
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
};

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('the refresh token', () => {
  it('names its session, so a presented token can be found before it is trusted', () => {
    const { token } = issueRefreshToken(SESSION_ID, CONFIG);

    expect(token.startsWith(`${SESSION_ID}.`)).toBe(true);
    expect(parseRefreshToken(token)).toEqual({ sessionId: SESSION_ID, secret: token.slice(SESSION_ID.length + 1) });
  });

  it('carries 256 bits of unguessable secret, and never repeats one', () => {
    const first = issueRefreshToken(SESSION_ID, CONFIG);
    const second = issueRefreshToken(SESSION_ID, CONFIG);

    expect(first.token).not.toBe(second.token);
    // 32 random bytes, base64url: 43 characters, and the last of them is fully used.
    expect(first.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores a keyed digest, never the secret itself', () => {
    const { secret, hash } = issueRefreshToken(SESSION_ID, CONFIG);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
    expect(hashRefreshTokenSecret(secret, CONFIG)).toBe(hash);
  });

  it('digests the same secret differently under a different key', () => {
    const { secret, hash } = issueRefreshToken(SESSION_ID, CONFIG);
    const other = hashRefreshTokenSecret(secret, { ...CONFIG, refreshSecret: 'c'.repeat(64) });

    expect(other).not.toBe(hash);
  });

  it('refuses anything that is not one of its own tokens', () => {
    const { token } = issueRefreshToken(SESSION_ID, CONFIG);
    const [sessionId, secret] = token.split('.');

    expect(parseRefreshToken('')).toBeNull();
    expect(parseRefreshToken('no-separator')).toBeNull();
    expect(parseRefreshToken(`${SESSION_ID}.`)).toBeNull();
    expect(parseRefreshToken(`.${secret!}`)).toBeNull();
    expect(parseRefreshToken(`not-a-uuid.${secret!}`)).toBeNull();
    expect(parseRefreshToken(`${sessionId}.${secret}.extra`)).toBeNull();
  });
});
