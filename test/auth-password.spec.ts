import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as login } from '../app/api/auth/login/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { POST as password } from '../app/api/auth/password/route';
import { POST as refresh } from '../app/api/auth/refresh/route';
import { hash, verify } from '../src/server/auth/password';
import { CURRENCIES, prisma, seedCurrencies } from './helpers/db';

const PASSWORD = 'phase-two-spec-password';
const NEW_PASSWORD = 'phase-two-spec-password-changed';
const created: string[] = [];

async function createSignInUser(slug: string): Promise<{ id: string; email: string }> {
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

  return { id: user.id, email };
}

function post(
  handler: (request: Request, context?: unknown) => Promise<Response>,
  body: unknown,
  options: { ip: string; token?: string },
): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': options.ip,
  };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;

  return handler(
    new Request('http://localhost/api/auth', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

async function signIn(email: string, ip: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string };
}> {
  const response = await post(login, { email, password: PASSWORD }, { ip });
  expect(response.status).toBe(200);
  return response.json();
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

describe('signing out', () => {
  it('kills the access token at once, fifteen minutes early', async () => {
    const { email } = await createSignInUser('logout');
    const signedIn = await signIn(email, '10.8.1.1');

    // the access token works: authentication passes, and only the password check fails
    const before = await post(
      password,
      { currentPassword: 'not-the-password', newPassword: NEW_PASSWORD },
      { ip: '10.8.1.2', token: signedIn.accessToken },
    );
    expect(before.status).toBe(401);
    await expect(before.json()).resolves.toMatchObject({
      error: { code: 'current_password_incorrect' },
    });

    const ended = await post(logout, { refreshToken: signedIn.refreshToken }, { ip: '10.8.1.3' });
    expect(ended.status).toBe(200);
    await expect(ended.json()).resolves.toEqual({ status: 'ok' });

    const after = await post(
      password,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      { ip: '10.8.1.4', token: signedIn.accessToken },
    );
    expect(after.status).toBe(401);
    await expect(after.json()).resolves.toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a protected route with no token at all', async () => {
    const response = await post(
      password,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      { ip: '10.8.1.5' },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a token that was signed for nobody knows what', async () => {
    const response = await post(
      password,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      { ip: '10.8.1.6', token: 'not.a.token' },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthenticated' } });
  });
});

describe('changing your own password', () => {
  it('requires the current one, and changes nothing when it is wrong', async () => {
    const { id, email } = await createSignInUser('wrong-current');
    const signedIn = await signIn(email, '10.8.2.1');
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });

    const refused = await post(
      password,
      { currentPassword: 'not-the-password', newPassword: NEW_PASSWORD },
      { ip: '10.8.2.2', token: signedIn.accessToken },
    );

    expect(refused.status).toBe(401);
    await expect(refused.json()).resolves.toMatchObject({
      error: { code: 'current_password_incorrect' },
    });
    expect(await prisma.auditLog.count({ where: { user_id: id, action: 'password_changed' } })).toBe(0);

    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.password_hash).toBe(before.password_hash);
    expect(await verify(after.password_hash, PASSWORD)).toBe(true);
  });

  it('replaces the hash, records it, and swaps which password signs in', async () => {
    const { id, email } = await createSignInUser('changed');
    const signedIn = await signIn(email, '10.8.3.1');

    const changed = await post(
      password,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      { ip: '10.8.3.2', token: signedIn.accessToken },
    );

    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toEqual({ status: 'ok' });
    expect(await prisma.auditLog.count({ where: { user_id: id, action: 'password_changed' } })).toBe(1);

    const oldPassword = await post(login, { email, password: PASSWORD }, { ip: '10.8.3.3' });
    expect(oldPassword.status).toBe(401);

    const newPassword = await post(login, { email, password: NEW_PASSWORD }, { ip: '10.8.3.4' });
    expect(newPassword.status).toBe(200);
    expect((await newPassword.json()).user.id).toBe(id);
  });

  it('changes the account the token names, and no other, whatever the body says', async () => {
    const mine = await createSignInUser('mine');
    const theirs = await createSignInUser('theirs');
    const signedIn = await signIn(mine.email, '10.8.4.1');
    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: theirs.id } });

    const changed = await post(
      password,
      {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        userId: theirs.id,
        user_id: theirs.id,
        email: theirs.email,
      },
      { ip: '10.8.4.2', token: signedIn.accessToken },
    );

    expect(changed.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(after.password_hash).toBe(untouched.password_hash);
    expect(await verify(after.password_hash, PASSWORD)).toBe(true);

    const mineAfter = await prisma.user.findUniqueOrThrow({ where: { id: mine.id } });
    expect(await verify(mineAfter.password_hash, NEW_PASSWORD)).toBe(true);
  });

  it('refuses a new password shorter than eight characters', async () => {
    const { id, email } = await createSignInUser('too-short');
    const signedIn = await signIn(email, '10.8.6.1');
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });

    const refused = await post(
      password,
      { currentPassword: PASSWORD, newPassword: '1234567' },
      { ip: '10.8.6.2', token: signedIn.accessToken },
    );

    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toMatchObject({
      error: { code: 'validation_failed', field: 'newPassword' },
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.password_hash).toBe(before.password_hash);
    expect(await prisma.auditLog.count({ where: { user_id: id, action: 'password_changed' } })).toBe(0);
  });

  it('ends every other session of the account, and keeps the one that changed it', async () => {
    const { id, email } = await createSignInUser('sessions');
    const first = await signIn(email, '10.8.7.1');
    const second = await signIn(email, '10.8.7.2');

    const changed = await post(
      password,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      { ip: '10.8.7.3', token: first.accessToken },
    );
    expect(changed.status).toBe(200);

    // The session that made the change is still signed in: authentication passes and only the
    // current-password check fails.
    const stillMine = await post(
      password,
      { currentPassword: 'not-the-password', newPassword: NEW_PASSWORD },
      { ip: '10.8.7.4', token: first.accessToken },
    );
    expect(stillMine.status).toBe(401);
    await expect(stillMine.json()).resolves.toMatchObject({
      error: { code: 'current_password_incorrect' },
    });

    // The other one is not, and its refresh token is worth nothing either.
    const other = await post(
      password,
      { currentPassword: NEW_PASSWORD, newPassword: PASSWORD },
      { ip: '10.8.7.5', token: second.accessToken },
    );
    expect(other.status).toBe(401);
    await expect(other.json()).resolves.toMatchObject({ error: { code: 'unauthenticated' } });
    expect((await post(refresh, { refreshToken: second.refreshToken }, { ip: '10.8.7.6' })).status).toBe(401);

    const sessions = await prisma.session.findMany({
      where: { user_id: id },
      select: { id: true, revoked_at: true },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.revoked_at !== null).map((s) => s.id)).toEqual([
      second.refreshToken.split('.')[0],
    ]);
  });
});
