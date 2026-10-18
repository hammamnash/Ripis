import { accountKey, PASSWORD_PER_ACCOUNT } from '../../../../src/server/auth/attempts';
import { changePassword } from '../../../../src/server/auth/change-password';
import { withCaller } from '../../../../src/server/auth/require-user';
import { readJsonObject, readString, tooManyRequests } from '../../../../src/server/http/request';
import { checkRateLimit } from '../../../../src/server/rate-limit';

/**
 * `POST /api/auth/password` — `02-context.md` §6.1, and the first protected route in the application.
 * It changes the password of the caller the token names, and of nobody else. It also ends the account's
 * other sessions (ADR-0045); the rate limit is keyed on the account rather than the session, so
 * opening a second session does not buy a fresh budget.
 */
export const POST = withCaller(async (request, { caller, session }) => {
  const body = await readJsonObject(request);
  const currentPassword = readString(body, 'currentPassword');
  const newPassword = readString(body, 'newPassword');

  const attempts = checkRateLimit(accountKey('password', caller.id), PASSWORD_PER_ACCOUNT);
  if (!attempts.allowed) return tooManyRequests(attempts.retryAfterSeconds);

  await changePassword({
    userId: caller.id,
    currentSessionId: session.sessionId,
    currentPassword,
    newPassword,
  });

  return Response.json({ status: 'ok' });
});
