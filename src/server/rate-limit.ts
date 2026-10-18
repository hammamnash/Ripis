/**
 * A sliding-window limiter over an in-process map.
 *
 * In-process because there is no second process and no Redis to put it in (ADR-0039, ADR-0011), and the
 * honest consequence is written down rather than hidden: a restart forgets every counter, and two
 * instances of this app would each keep their own. It is a speed bump for a password guesser, not a
 * security boundary — the audit row and Argon2id's cost are the parts that do not forget.
 *
 * The window slides, measured from `now`, rather than resetting on a bucket boundary: a fixed window lets
 * a client spend a full budget at 0:59 and another at 1:01, which is twice the intended rate exactly when
 * it matters. A refused attempt is not recorded, so a client that stops hammering recovers as soon as its
 * oldest attempt leaves the window instead of extending its own lockout.
 *
 * `now` is a parameter so the window can be tested without waiting for it.
 */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Whole seconds until the oldest attempt leaves the window; 0 when allowed. */
  retryAfterSeconds: number;
}

const attemptsByKey = new Map<string, number[]>();

/** Above this many keys, one call pays for a sweep of the ones whose window has emptied. */
const SWEEP_THRESHOLD = 10_000;

export function checkRateLimit(key: string, rule: RateLimitRule, now: number = Date.now()): RateLimitVerdict {
  if (attemptsByKey.size > SWEEP_THRESHOLD) {
    sweep(now);
  }

  const windowStart = now - rule.windowMs;
  const live = (attemptsByKey.get(key) ?? []).filter((attempt) => attempt > windowStart);

  if (live.length >= rule.limit) {
    attemptsByKey.set(key, live);

    const oldest = live[0] as number;

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1_000)),
    };
  }

  live.push(now);
  attemptsByKey.set(key, live);

  return { allowed: true, retryAfterSeconds: 0 };
}

function sweep(now: number): void {
  for (const [key, attempts] of attemptsByKey) {
    if (attempts.length === 0 || attempts[attempts.length - 1]! <= now - 86_400_000) {
      attemptsByKey.delete(key);
    }
  }
}
