import { unstable_rethrow } from 'next/navigation';

import { runAsCaller, type Caller } from '../context';
import { ApiError, errorResponse } from '../http/errors';
import { readAuthConfig, type AuthConfig } from './config';
import { verifyAccessToken } from './jwt';
import { screenSession } from './screen-session';
import { findLiveSession, type LiveSession } from './session';
import { SESSION_COOKIE } from './session-cookie';

/**
 * The one place a request becomes a caller.
 *
 * The signature is not the whole check. The token also names the session it was issued for, and that
 * session has to still be live — revoked and expired both count as gone. That extra read is what makes
 * signing out take effect immediately instead of whenever the access token happens to run out
 * (ADR-0041), and it is the reason this is a database lookup rather than a pure function.
 *
 * Both halves are handed on, because they answer different questions: the `caller` is *who* (what the
 * scoping extension needs, and nothing more), and the `session` is *which sign-in* — which is what a
 * password change needs, so it can end the others and keep this one (ADR-0045). Keeping them separate
 * is why `Caller` did not have to grow a field that only one route cares about.
 *
 * A request with no `Authorization` header is answered from the `ripis_session` cookie rather than
 * refused outright — the same credential the screen frame already resolves, through the same
 * `screenSession`/`findLiveSession` read (see `cookieSession` below). The header path is untouched: a
 * bearer token that is present but bad still ends at the 401, because that is the signal a non-browser
 * client refreshes on.
 *
 * The config is read per request rather than at import: a module that throws on a missing secret at
 * import time breaks `next build` in a way that is hard to read, while the same failure at request
 * time is a 500 with a message naming the variable.
 */

function unauthenticated(): ApiError {
  return new ApiError('unauthenticated', 401, 'Sign in to continue.');
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');

  if (header === null || !header.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();

  return token === '' ? null : token;
}

/**
 * The cookie half of the same decision, for a route handler.
 *
 * `screen-session.ts` resolves the cookie for a server component, which has `cookies()` but no `Request`.
 * A route handler is the mirror image: it is handed a `Request` and cannot call `cookies()`, so the value
 * is read off the header here. `screenSession` does the actual work — the id-shape guard and
 * `findLiveSession` — so both paths answer "still signed in?" from one database read with one definition
 * of a live session (ADR-0041), and a revoked or expired cookie fails identically on both sides.
 */
async function cookieSession(request: Request): Promise<Authenticated> {
  const pairs = request.headers.get('cookie')?.split(';') ?? [];

  for (const pair of pairs) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === SESSION_COOKIE) {
      const resolved = await screenSession(rest.join('='));
      if (resolved !== null) return resolved;
      break;
    }
  }

  throw unauthenticated();
}

export interface Authenticated {
  caller: Caller;
  session: LiveSession;
}

export async function requireSession(
  request: Request,
  config: AuthConfig = readAuthConfig(),
): Promise<Authenticated> {
  const token = bearerToken(request);

  /* No header means this is the browser's own session speaking. A token that is present but wrong is not
     that case: falling through would let a stale-token bug hide as a working cookie, so a failed bearer
     attempt ends at the 401 that tells the client to refresh. */
  if (token === null) return cookieSession(request);

  const claims = await verifyAccessToken(token, config);
  if (claims === null) throw unauthenticated();

  const session = await findLiveSession(claims.sessionId);
  if (session === null || session.userId !== claims.userId) throw unauthenticated();

  return { caller: { id: session.userId, role: session.role }, session };
}

/** For a handler that needs nothing but the caller. */
export async function requireCaller(
  request: Request,
  config: AuthConfig = readAuthConfig(),
): Promise<Caller> {
  return (await requireSession(request, config)).caller;
}

export type AuthedRoute<Context = unknown> = (
  request: Request,
  authenticated: Authenticated,
  context: Context,
) => Promise<Response>;

/**
 * Wraps a protected route handler: it resolves the caller, runs the handler *as* that caller so the
 * scoping extension can see who is asking, and renders whatever the handler throws.
 *
 * The second argument is the route's own context, which a dynamic route needs for its path parameters —
 * `/api/users/[id]/password` reads the id from there. A static route ignores it.
 *
 * The audit row is *not* written here. It is written by `writeAudited` around the write itself, which is
 * what makes "exactly one row per write" structural: a wrapper that logged every request would log reads
 * too, and would log a write that then failed.
 */
export function withCaller<Context = unknown>(
  handler: AuthedRoute<Context>,
): (request: Request, context: Context) => Promise<Response> {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      const authenticated = await requireSession(request);

      return await runAsCaller(authenticated.caller, () =>
        handler(request, authenticated, context),
      );
    } catch (error) {
      /*
       * Next's build-time prerender probe is not a failure, it is a *question* — "could this route be
       * static?" — and it asks by throwing. `bearerToken` reads `request.headers` on every guarded
       * request, and during the probe that read throws `DynamicServerError` (digest
       * `DYNAMIC_SERVER_USAGE`) to answer no. Rendering it as a 500 turned the answer into a logged
       * failure on every build: eight lines naming `/api/budgets/status` and the three `/api/reports/*`
       * routes. The routes were dynamic anyway — Next marks them from its own usage tracking — so what
       * the swallowing bought was a build that reported a problem it did not have. `unstable_rethrow`
       * is Next's own predicate for its internal control-flow errors (`notFound`, `redirect`, and this
       * bailout), so the guard stays correct when Next adds a fifth one.
       */
      unstable_rethrow(error);

      return errorResponse(error);
    }
  };
}
