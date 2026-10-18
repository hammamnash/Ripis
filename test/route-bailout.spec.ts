import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withCaller } from '../src/server/auth/require-user';
import { ApiError } from '../src/server/http/errors';
import { teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * A bailout is an answer, and an answer must not be rendered as a failure (§7.1 of the Phase 5 handoff).
 *
 * `next build` probes a GET-only route to decide whether it could be prerendered, and the probe's "no"
 * arrives as a thrown `DynamicServerError`. `withCaller` resolves the caller *before* the handler runs,
 * and resolving the caller means reading `request.headers` — so that throw came out of the guard itself,
 * landed in the same `catch` that renders real failures, and every build printed eight lines naming
 * `/api/budgets/status` and the three `/api/reports/*` routes. The routes were dynamic regardless (Next
 * marks them from its own usage tracking), so the swallowing bought nothing except a build reporting a
 * problem it did not have: the one place errors are rendered could not tell a bug from Next asking a
 * question.
 *
 * The digest is the whole of Next's own predicate — `isDynamicServerError` compares that string and
 * nothing else — so the fixture is what Next throws rather than an approximation of it. The sign-in is
 * real for the same reason the rest of the suite signs in for real: the guard has to have run, and the
 * throw has to arrive from inside the guarded request, or this asserts something about a different
 * function.
 */
const EMAIL = 'phase-6-route-bailout@ripis.test';

function dynamicServerError(): Error {
  const error = new Error(
    'Route /api/x needs to bail out of prerendering at this point because it used request.headers.',
  );
  Object.assign(error, { digest: 'DYNAMIC_SERVER_USAGE' });

  return error;
}

describe('withCaller', () => {
  let ledger: SpecLedger;

  beforeAll(async () => {
    ledger = await signedInLedger(EMAIL);
  });

  afterAll(async () => {
    await closeLedger(ledger);
    await teardownTestData();
  });

  it("re-throws Next's prerender bailout instead of rendering it as a 500", async () => {
    const route = withCaller(async () => {
      throw dynamicServerError();
    });

    await expect(route(ledger.request('/api/x'), undefined)).rejects.toThrow(/needs to bail out/);
  });

  it('still renders an ApiError, so the guard did not become a catch-nothing', async () => {
    const route = withCaller(async () => {
      throw new ApiError('forbidden', 403, 'That act is admin-only.');
    });

    const response = await route(ledger.request('/api/x'), undefined);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'forbidden', message: 'That act is admin-only.' },
    });
  });
});
