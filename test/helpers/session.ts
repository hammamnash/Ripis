import { readAuthConfig } from '../../src/server/auth/config';
import { hash } from '../../src/server/auth/password';
import { signIn } from '../../src/server/auth/sign-in';
import { SESSION_COOKIE } from '../../src/server/auth/session-cookie';
import { CURRENCIES, prisma, resetLedger, seedCurrencies } from './db';

/**
 * A signed-in ledger to exercise the Phase 3 endpoints against.
 *
 * The route handlers these specs call are the real ones, and the token is the real thing too: the
 * account is created, then `signIn` — the same module `POST /api/auth/login` calls — hashes, verifies,
 * opens a session row and signs an access token. Nothing here stubs authentication, so a spec that
 * passes is a statement about the endpoint rather than about a bypass, and the `withCaller` guard runs
 * on every one of them.
 *
 * Sign-in is called directly rather than through the login route because the route counts attempts
 * against a per-address rate limit: a spec that signs in eleven times would start getting 429s from a
 * guard that is working correctly, which is a confusing way to fail.
 */
export interface SpecLedger {
  userId: string;
  email: string;
  token: string;
  /** The session id the `ripis_session` cookie carries — what a browser would send. */
  sessionId: string;
  /** A request the endpoint will accept, with the `Bearer` token already attached. */
  request(path: string, init?: { method?: string; body?: unknown }): Request;
  /** The same request authenticated by the session cookie alone, as the app's own client sends it. */
  cookieRequest(path: string, init?: { method?: string; body?: unknown }): Request;
}

const PASSWORD = 'phase-3-spec-password';

export async function signedInLedger(email: string): Promise<SpecLedger> {
  await seedCurrencies();
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      name: 'Phase 3 Spec',
      email,
      password_hash: await hash(PASSWORD),
      primary_currency_id: CURRENCIES.base.code,
    },
  });

  const { accessToken, sessionId } = await signIn(email, PASSWORD, readAuthConfig());

  const build = (path: string, init: { method?: string; body?: unknown }, credential: string) =>
    new Request(`http://spec.local${path}`, {
      method: init.method ?? 'GET',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: { 'content-type': 'application/json', ...credentialHeader(credential) },
    });

  return {
    userId: user.id,
    email,
    token: accessToken,
    sessionId,
    request: (path, init = {}) => build(path, init, `Bearer ${accessToken}`),
    cookieRequest: (path, init = {}) => build(path, init, `${SESSION_COOKIE}=${sessionId}`),
  };
}

/** The credential under the header its kind belongs to: `Bearer` rides on `authorization`, a cookie on `cookie`. */
function credentialHeader(credential: string): Record<string, string> {
  return credential.startsWith('Bearer ')
    ? { authorization: credential }
    : { cookie: credential };
}

export async function closeLedger(ledger: SpecLedger): Promise<void> {
  await resetLedger(ledger.userId);
  await prisma.user.deleteMany({ where: { email: ledger.email } });
}
