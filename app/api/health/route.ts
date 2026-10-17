/** The health response shape. Narrow on purpose: `status` is the only value that may ever be `ok`. */
export interface HealthResponse {
  status: 'ok';
}

/**
 * Liveness, not readiness: the process is up and this route is wired. It deliberately touches no
 * dependency — a probe that can report a database failure without a defined response to it is
 * worse than no probe. This replaces the Nest controller deleted with the framework (ADR-0039).
 */
export function GET(): Response {
  const body: HealthResponse = { status: 'ok' };

  return Response.json(body);
}
