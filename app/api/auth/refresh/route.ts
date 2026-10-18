import { addressKey, REFRESH_PER_ADDRESS } from '../../../../src/server/auth/attempts';
import { readAuthConfig } from '../../../../src/server/auth/config';
import { signAccessToken } from '../../../../src/server/auth/jwt';
import { rotateSession } from '../../../../src/server/auth/session';
import { errorResponse } from '../../../../src/server/http/errors';
import { readJsonObject, readString, tooManyRequests } from '../../../../src/server/http/request';
import { checkRateLimit } from '../../../../src/server/rate-limit';

/**
 * `POST /api/auth/refresh` — `02-context.md` §6.1. Public by design: a client whose access token has
 * expired has no credential left to authenticate with, which is the whole point of the call.
 *
 * Rotation happens on every use, so a refresh token is single-use. Presenting a spent one is treated
 * as theft and ends the session (`session.ts`).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const refreshToken = readString(body, 'refreshToken');

    const byAddress = checkRateLimit(addressKey('refresh', request), REFRESH_PER_ADDRESS);
    if (!byAddress.allowed) return tooManyRequests(byAddress.retryAfterSeconds);

    const config = readAuthConfig();
    const rotated = await rotateSession(refreshToken, config);
    const accessToken = await signAccessToken(
      { userId: rotated.userId, sessionId: rotated.sessionId },
      config,
    );

    return Response.json({
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: config.accessTtlSeconds,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
