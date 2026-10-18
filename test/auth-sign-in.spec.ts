import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as login } from '../app/api/auth/login/route';
import { POST as refresh } from '../app/api/auth/refresh/route';
import { hash } from '../src/server/auth/password';
import { CURRENCIES, prisma, seedCurrencies } from './helpers/db';

const PASSWORD = 'phase-two-spec-password';
const created: string[] = [];

async function createSignInUser(slug: string): Promise<string> {
  const email = `phase-2-${slug}@ripis.test`;
  created.push(email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  const user = await prisma.user.create({
    data: {
      name: 'Phase Two Spec',
      email,
      password_hash: await hash(PASSWORD),
      primary_currency_id: CURRENCIES.base.code,
    },
  });

  return user.id;
}

function post(
  handler: (request: Request, context?: unknown) => Promise<Response>,
  body: unknown,
  ip: string,
): Promise<Response> {
  return handler(
    new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(seedCurrencies);

afterAll(async () => {
  for (const email of created) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user === null) continue;
    await prisma.auditLog.deleteMany({ where: { user_id: user.id } });
    await prisma.session.deleteMany({ where: { user_id: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

describe('POST /api/auth/login', () => {
  it('refuses a wrong password and records the attempt', async () => {
    const userId = await createSignInUser('wrong-password');

    const response = await post(
      login,
      { email: 'phase-2-wrong-password@ripis.test', password: 'not-the-password' },
      '10.9.1.1',
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'invalid_credentials', message: 'That email and password do not match.' },
    });
    expect(await prisma.auditLog.count({ where: { user_id: userId, action: 'auth_failed' } })).toBe(1);
  });

  it('refuses an address with no account in exactly the same words, and records nothing', async () => {
    const before = await prisma.auditLog.count();

    const response = await post(
      login,
      { email: 'nobody-here@ripis.test', password: 'not-the-password' },
      '10.9.1.2',
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'invalid_credentials', message: 'That email and password do not match.' },
    });
    // There is no account to hang the row on, and the client may not learn the difference either way.
    expect(await prisma.auditLog.count()).toBe(before);
  });

  it('issues a token pair and records the sign-in', async () => {
    const userId = await createSignInUser('signed-in');

    const response = await post(
      login,
      { email: 'phase-2-signed-in@ripis.test', password: PASSWORD },
      '10.9.1.3',
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.expiresIn).toBe(900);
    expect(body.refreshToken.startsWith(`${body.user.id}.`)).toBe(false);
    expect(body.user).toMatchObject({
      id: userId,
      email: 'phase-2-signed-in@ripis.test',
      role: 'user',
    });

    expect(await prisma.auditLog.count({ where: { user_id: userId, action: 'signed_in' } })).toBe(1);
    expect(await prisma.session.count({ where: { user_id: userId, revoked_at: null } })).toBe(1);
  });

  it('refuses the sixth rapid attempt with 429', async () => {
    await createSignInUser('too-many');

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await post(
        login,
        { email: 'phase-2-too-many@ripis.test', password: 'not-the-password' },
        '10.9.1.4',
      );
      expect(response.status).toBe(401);
    }

    const refused = await post(
      login,
      { email: 'phase-2-too-many@ripis.test', password: PASSWORD },
      '10.9.1.4',
    );

    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBeTruthy();
    await expect(refused.json()).resolves.toMatchObject({ error: { code: 'rate_limited' } });
  });
});

describe('POST /api/auth/refresh', () => {
  it('spends the refresh token, and treats a spent one as theft', async () => {
    await createSignInUser('rotation');

    const signedIn = await (
      await post(login, { email: 'phase-2-rotation@ripis.test', password: PASSWORD }, '10.9.2.1')
    ).json();
    const sessionId = signedIn.refreshToken.split('.')[0];

    const rotated = await post(refresh, { refreshToken: signedIn.refreshToken }, '10.9.2.2');

    expect(rotated.status).toBe(200);
    const next = await rotated.json();
    expect(next.refreshToken).not.toBe(signedIn.refreshToken);
    expect(next.accessToken.split('.')).toHaveLength(3);

    const replayed = await post(refresh, { refreshToken: signedIn.refreshToken }, '10.9.2.3');
    expect(replayed.status).toBe(401);
    await expect(replayed.json()).resolves.toMatchObject({
      error: { code: 'invalid_refresh_token' },
    });

    expect(
      await prisma.session.findUniqueOrThrow({ where: { id: sessionId } }).then((s) => s.revoked_at),
    ).not.toBeNull();

    // the token handed out a moment ago belongs to a session that no longer exists
    expect((await post(refresh, { refreshToken: next.refreshToken }, '10.9.2.4')).status).toBe(401);
  });

  it('refuses what is not a refresh token', async () => {
    const response = await post(refresh, { refreshToken: 'nonsense' }, '10.9.2.5');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_refresh_token' },
    });
  });
});
