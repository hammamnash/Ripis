import { readAuthConfig } from '../../../../src/server/auth/config';
import { accountKey, addressKey, LOGIN_PER_ACCOUNT, LOGIN_PER_ADDRESS } from '../../../../src/server/auth/attempts';
import { signIn } from '../../../../src/server/auth/sign-in';
import { errorResponse } from '../../../../src/server/http/errors';
import { readJsonObject, readString, tooManyRequests } from '../../../../src/server/http/request';
import { checkRateLimit } from '../../../../src/server/rate-limit';

/**
 * `POST /api/auth/login` — `02-context.md` §6.1. Public.
 *
 * The attempt is counted before the password is checked, so a failed sign-in spends budget and a
 * twelfth guess in a minute is refused without touching Argon2 at all.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const email = readString(body, 'email');
    const password = readString(body, 'password');

    const byAccount = checkRateLimit(accountKey('login', email), LOGIN_PER_ACCOUNT);
    if (!byAccount.allowed) return tooManyRequests(byAccount.retryAfterSeconds);

    const byAddress = checkRateLimit(addressKey('login', request), LOGIN_PER_ADDRESS);
    if (!byAddress.allowed) return tooManyRequests(byAddress.retryAfterSeconds);

    return Response.json(await signIn(email, password, readAuthConfig()));
  } catch (error) {
    return errorResponse(error);
  }
}
