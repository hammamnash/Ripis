import { describe, expect, it } from 'vitest';

import { GET } from '../app/api/health/route';

/**
 * Task 0.4's contract, kept after the framework left (ADR-0039): the route answers
 * `{ status: "ok" }` with 200.
 *
 * The handler is called directly. The Nest suite booted a module graph over HTTP to prove the
 * graph resolved; there is no graph, so the HTTP hop would only be testing Next.
 */
describe('GET /api/health', () => {
  it('answers ok', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
