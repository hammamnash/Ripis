import { readAuthConfig } from '../../../../src/server/auth/config';
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
 * Signing out is not audited. `AuditAction` has no `signed_out`, and adding one is an enum migration
 * with a decision behind it, not a detail of this route.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const refreshToken = readString(body, 'refreshToken');

    await revokeSessionByRefreshToken(refreshToken, readAuthConfig());

    return Response.json({ status: 'ok' });
  } catch (error) {
    return errorResponse(error);
  }
}
