import { describe, expect, it } from 'vitest';

import { checkRateLimit } from './rate-limit';

/**
 * A sliding window, not a fixed one: with a fixed window a client can spend a full budget at 0:59 and
 * another at 1:01, which is twice the intended rate exactly when it matters. The clock is a parameter
 * so the window can be tested without waiting for it.
 */
const RULE = { limit: 5, windowMs: 60_000 };

describe('checkRateLimit', () => {
  it('allows the budget and refuses the next attempt', () => {
    for (let attempt = 1; attempt <= RULE.limit; attempt += 1) {
      expect(checkRateLimit('k', RULE, 0).allowed).toBe(true);
    }

    const sixth = checkRateLimit('k', RULE, 0);

    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBe(60);
  });

  it('keeps one key from spending another key’s budget', () => {
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      checkRateLimit('ip:one', RULE, 0);
    }

    expect(checkRateLimit('ip:one', RULE, 0).allowed).toBe(false);
    expect(checkRateLimit('ip:two', RULE, 0).allowed).toBe(true);
  });

  it('slides: an attempt is forgiven once it leaves the window, not when a bucket resets', () => {
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      checkRateLimit('slide', RULE, attempt * 1_000);
    }

    // One second short of the window expiring, still refused and told how long is left.
    const last = checkRateLimit('slide', RULE, 59_999);

    expect(last.allowed).toBe(false);
    expect(last.retryAfterSeconds).toBe(1);

    // The attempt at 0 has left the window, so one attempt is forgiven — exactly one, at the moment it
    // ages out and not a second before. A fixed window would forgive all five at 60_000.
    expect(checkRateLimit('slide', RULE, 60_001).allowed).toBe(true);
    expect(checkRateLimit('slide', RULE, 60_500).allowed).toBe(false);
  });

  it('never reports a retry wait of zero or less on a refusal', () => {
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      checkRateLimit('floor', RULE, 1_000);
    }

    const refused = checkRateLimit('floor', RULE, 1_000);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
