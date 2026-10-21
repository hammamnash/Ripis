import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as listCategories } from '../app/api/categories/route';
import { SESSION_COOKIE } from '../src/server/auth/session-cookie';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * The cookie half of `withCaller` (Task 7.4, ADR-0041).
 *
 * The screens authenticate through the `ripis_session` cookie, and from Task 7.4 the app's own client
 * code can call the API with nothing but that cookie — the Settings data section does exactly this for
 * exports and imports. These specs pin the three consequences: the cookie is accepted wherever a bearer
 * token was, a bad bearer token is still refused even with a valid cookie alongside it, and a revoked
 * cookie is refused by the very next request, because the live-session read happens on every request
 * rather than whenever a token happens to expire.
 *
 * `signedInLedger` mints the cookie value through the same `signIn` the login route calls, so what a
 * spec sends is what a browser sends. The revocation spec runs last because it revokes the session the
 * other two used.
 */
const EMAIL = 'phase-7-cookie@ripis.test';

let ledger: SpecLedger;

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
  await prisma.$disconnect();
});

describe('a guarded route called with only the session cookie', () => {
  it('answers the same as the bearer token does', async () => {
    const viaToken = await listCategories(ledger.request('/api/categories'), undefined);
    const viaCookie = await listCategories(ledger.cookieRequest('/api/categories'), undefined);

    expect(viaToken.status).toBe(200);
    expect(viaCookie.status).toBe(200);
    expect(await viaCookie.json()).toEqual(await viaToken.json());
  });

  it('refuses a bearer token that is present but bad, even with a valid cookie riding along', async () => {
    /* The fallthrough is only for requests with no header at all: a client that tried to authenticate
       and failed must hear about it, or a stale-token bug hides behind a working cookie. */
    const request = new Request('http://spec.local/api/categories', {
      headers: {
        cookie: `${SESSION_COOKIE}=${ledger.sessionId}`,
        authorization: 'Bearer not-a-token',
      },
    });

    const response = await listCategories(request, undefined);

    expect(response.status).toBe(401);
  });

  it('is refused by the very next request once the session is revoked', async () => {
    /* The same database write the logout route performs, against the session this ledger signed in as. */
    await prisma.session.update({ where: { id: ledger.sessionId }, data: { revoked_at: new Date() } });

    const response = await listCategories(ledger.cookieRequest('/api/categories'), undefined);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthenticated' } });
  });
});
