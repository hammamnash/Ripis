import { runAsCaller, type Caller } from '../context';
import { ApiError, errorResponse } from '../http/errors';
import { readAuthConfig, type AuthConfig } from './config';
import { verifyAccessToken } from './jwt';
import { findLiveSession, type LiveSession } from './session';

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

export interface Authenticated {
  caller: Caller;
  session: LiveSession;
}

export async function requireSession(
  request: Request,
  config: AuthConfig = readAuthConfig(),
): Promise<Authenticated> {
  const token = bearerToken(request);
  if (token === null) throw unauthenticated();

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
      return errorResponse(error);
    }
  };
}
