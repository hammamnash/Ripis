import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import type { AuthConfig } from './config';
import { ACCESS_TOKEN_ISSUER, signAccessToken, verifyAccessToken } from './jwt';

const CONFIG: AuthConfig = {
  accessSecret: 'a'.repeat(64),
  refreshSecret: 'b'.repeat(64),
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
};

const CLAIMS = { userId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222' };

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** `verifyAccessToken` answers `null` for every rejection; that is the contract, so it is asserted. */
describe('access tokens', () => {
  it('round-trips the identity and the session it belongs to', async () => {
    const token = await signAccessToken(CLAIMS, CONFIG);

    await expect(verifyAccessToken(token, CONFIG)).resolves.toEqual(CLAIMS);
  });

  it('carries no role: the database is the only place a role is read from', async () => {
    const token = await signAccessToken(CLAIMS, CONFIG);
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<string, unknown>;

    expect(claims).not.toHaveProperty('role');
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'iss', 'sid', 'sub']);
  });

  it('is an HS256 JWT issued by this application', async () => {
    const token = await signAccessToken(CLAIMS, CONFIG);
    const [header, payload] = token.split('.');

    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toMatchObject({ iss: ACCESS_TOKEN_ISSUER });
  });

  it('is refused once it has expired, rather than trusted for its own lifetime', async () => {
    const token = await signAccessToken(CLAIMS, CONFIG, new Date(Date.now() - 901_000));

    await expect(verifyAccessToken(token, CONFIG)).resolves.toBeNull();
  });

  it('is refused when it was signed with the other secret', async () => {
    const token = await signAccessToken(CLAIMS, { ...CONFIG, accessSecret: CONFIG.refreshSecret });

    await expect(verifyAccessToken(token, CONFIG)).resolves.toBeNull();
  });

  it('is refused when it was not issued by this application', async () => {
    const foreign = await new SignJWT({ sid: CLAIMS.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(CLAIMS.userId)
      .setIssuer('somebody-else')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 900)
      .sign(keyOf(CONFIG.accessSecret));

    await expect(verifyAccessToken(foreign, CONFIG)).resolves.toBeNull();
  });

  it('is refused when the identity or the session is missing from the claims', async () => {
    const noSession = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(CLAIMS.userId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 900)
      .sign(keyOf(CONFIG.accessSecret));

    const noSubject = await new SignJWT({ sid: CLAIMS.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 900)
      .sign(keyOf(CONFIG.accessSecret));

    await expect(verifyAccessToken(noSession, CONFIG)).resolves.toBeNull();
    await expect(verifyAccessToken(noSubject, CONFIG)).resolves.toBeNull();
  });

  it('is refused when a single character of the payload has been altered', async () => {
    const token = await signAccessToken(CLAIMS, CONFIG);
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload!.slice(0, -2)}${payload!.slice(-2) === 'aa' ? 'bb' : 'aa'}.${signature}`;

    await expect(verifyAccessToken(tampered, CONFIG)).resolves.toBeNull();
  });

  it('is refused when it is not a token at all', async () => {
    for (const rubbish of ['', 'not-a-token', 'a.b.c', '..', 'Bearer abc']) {
      await expect(verifyAccessToken(rubbish, CONFIG)).resolves.toBeNull();
    }
  });
});
