import { ApiError } from './errors';

/**
 * What every route handler needs before it can delegate: a parsed body, the one field it asked for,
 * and the address the attempt came from. These are transport concerns, so they live in `http/` — the
 * `src/server/**` modules they feed never see a `Request`.
 */

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    throw new ApiError('validation_failed', 400, 'A JSON body is required.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError('validation_failed', 400, 'A JSON object is required.');
  }

  return parsed as Record<string, unknown>;
}

export function readString(body: Record<string, unknown>, field: string): string {
  const value = body[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError('validation_failed', 400, `${field} is required.`, field);
  }

  return value;
}

/**
 * The address an attempt came from, for rate limiting only — it is never stored.
 *
 * `x-forwarded-for` is trusted because behind a proxy it is the only address there is. When the header
 * is absent the key degrades to `unknown`, which pools every client into one bucket, so the callers
 * that matter pair this with a per-account key that does not depend on it.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();

  return first === undefined || first === '' ? 'unknown' : first;
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    {
      error: {
        code: 'rate_limited',
        message: `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
      },
    },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  );
}
