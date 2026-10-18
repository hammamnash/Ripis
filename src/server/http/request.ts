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
 * A field the request may leave out — and the reason these exist at all is the difference between
 * *absent* and *null*.
 *
 * `readString` demands a value, which is the right shape for a create: the request has to carry a name.
 * A PATCH does not have that shape, because `{"notes": null}` and `{}` mean different things — *clear
 * it* versus *leave it alone* — and a reader that collapses both into `undefined` makes clearing a note
 * impossible. So absent stays `undefined`, an explicit `null` stays `null`, and only a field that is
 * present and the wrong type is refused.
 */
export function readOptionalString(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  if (!(field in body)) return undefined;

  const value = body[field];

  if (value === null) return null;

  if (typeof value !== 'string') {
    throw new ApiError('validation_failed', 400, `${field} must be text or null.`, field);
  }

  // Deliberately not trimmed to nothing: an empty string is how a caller clears a note, whereas an
  // absent field is how they leave one alone.
  return value;
}

export function readOptionalBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean | undefined {
  if (!(field in body)) return undefined;

  const value = body[field];

  if (typeof value !== 'boolean') {
    throw new ApiError('validation_failed', 400, `${field} must be true or false.`, field);
  }

  return value;
}

/**
 * Refuses a body that names a field this endpoint does not have.
 *
 * Ignoring an unknown key is the more forgiving choice and the wrong one. A client that sent `parentId`
 * believes it created a sub-category — ADR-0014 says there is no such thing — and nothing anywhere reports
 * that it did not; the request returns 201 and the caller moves on. A refusal costs one line in the route
 * and turns a silent, believable success into a message naming the field.
 *
 * It also keeps a decision that has no column from looking like one that does: a body may only name fields
 * the endpoint actually reads.
 */
export function rejectUnknownFields(body: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(body).find((field) => !allowed.includes(field));

  if (unknown !== undefined) {
    throw new ApiError(
      'validation_failed',
      400,
      `${unknown} is not a field this request accepts.`,
      unknown,
    );
  }
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
