import { readAuthConfig } from '../../../../src/server/auth/config';
import { clearedSessionCookie, isSecureRequest } from '../../../../src/server/auth/session-cookie';
import { revokeSessionByRefreshToken } from '../../../../src/server/auth/session';
import { errorResponse } from '../../../../src/server/http/errors';
import { readJsonObject, readString } from '../../../../src/server/http/request';

/**
 * `POST /api/auth/logout` — `02-context.md` §6.1.
 *
 * It takes the refresh token rather than the access token, because the refresh token is the credential
 * a client still holds when its access token has expired — and needing to refresh before you are
 * allowed to sign out is a poor trade. Revoking the session is enough either way: the access token
 * names a session that must still be live, so it stops being accepted on the next request (ADR-0041).
 *
 * Since 7.4 the browser also holds a `ripis_session` cookie for the server components, and revoking the row
 * is already enough to make it inert — the cookie is only ever resolved through `findLiveSession`. It is
 * cleared here anyway: a user who signs out expects the browser to forget, and a client that keeps sending a
 * credential which can only fail turns one dead lookup into one per navigation.
 *
 * Signing out is not audited. `AuditAction` has no `signed_out`, and adding one is an enum migration
 * with a decision behind it, not a detail of this route.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const refreshToken = readString(body, 'refreshToken');

    await revokeSessionByRefreshToken(refreshToken, readAuthConfig());

    return Response.json(
      { status: 'ok' },
      { headers: { 'set-cookie': clearedSessionCookie(isSecureRequest(request)) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
