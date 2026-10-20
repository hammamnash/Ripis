import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readAuthConfig } from '../src/server/auth/config';
import { screenSession } from '../src/server/auth/screen-session';
import { startSession } from '../src/server/auth/session';
import { CURRENCIES, prisma, seedCurrencies } from './helpers/db';

/**
 * The decision behind the `(app)` guard, against real rows.
 *
 * `screenSession` is deliberately free of `next/headers`, so this spec tests what the guard *decides* — a
 * live row becomes a caller, a dead one does not — without a request scope. What it cannot test is the
 * redirect; that is asserted in the browser harness, where a missing cookie must land on `/sign-in`.
 *
 * Every case below is a way a session can stop being valid, and all of them must look identical to the
 * caller: absent, blank, unknown, revoked, expired. If revoked or expired ever resolved to a caller, a user
 * who signed out would keep a working browser session until the cookie's own Max-Age ran out.
 */

const EMAIL = 'screen-session-spec@ripis.test';

let userId = '';

beforeAll(async () => {
  await seedCurrencies();
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  const user = await prisma.user.create({
    data: {
      name: 'Screen Session Spec',
      email: EMAIL,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });

  userId = user.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { user_id: userId } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

describe('resolving the browser session for a screen', () => {
  it('turns a live session id into the caller the scoped client needs', async () => {
    const { sessionId } = await startSession(userId, readAuthConfig());

    const resolved = await screenSession(sessionId);

    expect(resolved).not.toBeNull();
    expect(resolved?.caller.id).toBe(userId);
    expect(resolved?.caller.role).toBe('user');
    expect(resolved?.session.sessionId).toBe(sessionId);
  });

  it('refuses an absent, blank or unparseable cookie without touching the database', async () => {
    for (const value of [undefined, null, '', '   ', 'not-a-session-id']) {
      expect(await screenSession(value), String(value)).toBeNull();
    }
  });

  it('stops resolving the moment the session is revoked, which is what sign-out relies on', async () => {
    const { sessionId } = await startSession(userId, readAuthConfig());
    expect(await screenSession(sessionId)).not.toBeNull();

    await prisma.session.update({ where: { id: sessionId }, data: { revoked_at: new Date() } });

    expect(await screenSession(sessionId)).toBeNull();
  });

  it('stops resolving once the session has expired, even though the cookie is still in the browser', async () => {
    const { sessionId } = await startSession(userId, readAuthConfig());

    await prisma.session.update({
      where: { id: sessionId },
      data: { expires_at: new Date(Date.now() - 1_000) },
    });

    expect(await screenSession(sessionId)).toBeNull();
  });

  it('resolves each session to its own row, so two browsers are not one sign-in', async () => {
    const first = await startSession(userId, readAuthConfig());
    const second = await startSession(userId, readAuthConfig());

    expect(first.sessionId).not.toBe(second.sessionId);
    expect((await screenSession(first.sessionId))?.session.sessionId).toBe(first.sessionId);
    expect((await screenSession(second.sessionId))?.session.sessionId).toBe(second.sessionId);
  });
});
