import type { Caller } from '../context';
import { findLiveSession, type LiveSession } from './session';

/**
 * A browser's session, resolved for a server component.
 *
 * This is the read-side twin of `requireSession` in `require-user.ts`, and the difference between them is
 * only where the credential comes from: a route handler is handed a `Request` and reads a header, while a
 * screen is handed nothing and reads a cookie. Everything after that is deliberately the *same* code —
 * `findLiveSession` — so there is one definition of "still signed in" rather than two that can drift. An
 * expired session, a revoked one and one that never existed all resolve to `null` here, exactly as they do
 * for the API.
 *
 * It lives outside `next/headers` on purpose. Reading `cookies()` and calling `redirect()` are properties of
 * *where this runs*, not of what it decides, so they belong to the caller (`requireScreenSession` below) and
 * this function stays testable against a real session row without a request scope.
 */

export interface ScreenSession {
  caller: Caller;
  session: LiveSession;
}

/**
 * The shape of a session id, checked before it is used as a key.
 *
 * Not defensiveness for its own sake: `Session.id` is a Postgres `uuid`, and Prisma sends the value as a
 * parameter, so `'not-a-session-id'` is not an empty result — it is a database error, which the frame would
 * render as a 500. A cookie is attacker-supplied and survives every schema change, so the guard has to treat
 * a value it cannot possibly have issued the same way it treats no value at all. Uppercase is accepted
 * because Postgres does.
 */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function screenSession(cookieValue: string | undefined | null): Promise<ScreenSession | null> {
  const sessionId = cookieValue?.trim();

  if (sessionId === undefined || sessionId === '') return null;
  if (!SESSION_ID.test(sessionId)) return null;

  const session = await findLiveSession(sessionId);

  if (session === null) return null;

  return { caller: { id: session.userId, role: session.role }, session };
}
