import { readAuthConfig } from '../../../../src/server/auth/config';
import { clearedSessionCookie, isSecureRequest, readSessionCookie } from '../../../../src/server/auth/session-cookie';
import { revokeSessionByRefreshToken, revokeSessionBySessionId } from '../../../../src/server/auth/session';
import { errorResponse } from '../../../../src/server/http/errors';
import { readJsonObject, readString } from '../../../../src/server/http/request';

/**
 * `POST /api/auth/logout` — `02-context.md` §6.1.
 *
 * It accepts the browser's HttpOnly `ripis_session` cookie for the web UI, or a refresh token in the JSON body
 * for API clients. The cookie holds the session id, and revoking that row is enough to make it inert on the
 * next request; the response clears the cookie as well. The refresh-token path retains token possession checks
 * for clients that do not use the browser session cookie.
 *
 * Signing out is not audited. `AuditAction` has no `signed_out`, and adding one is an enum migration
 * with a decision behind it, not a detail of this route.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const config = readAuthConfig();
    const sessionId = readSessionCookie(request);

    if (sessionId !== null) {
      await revokeSessionBySessionId(sessionId);
    } else {
      const body = await readJsonObject(request);
      const refreshToken = readString(body, 'refreshToken');
      await revokeSessionByRefreshToken(refreshToken, config);
    }

    return Response.json(
      { status: 'ok' },
      { headers: { 'set-cookie': clearedSessionCookie(isSecureRequest(request)) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
