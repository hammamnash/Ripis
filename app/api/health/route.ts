/** The health response shape. Narrow on purpose: `status` is the only value that may ever be `ok`. */
export interface HealthResponse {
  status: 'ok';
}

/**
 * Liveness, not readiness: the process is up and this route is wired. It deliberately touches no
 * dependency — a probe that can report a database failure without a defined response to it is
 * worse than no probe. This replaces the Nest controller deleted with the framework (ADR-0039).
 *
 * `next build` prerenders this route — it is static in the build output — which is right for a
 * constant and a trap for a future readiness check: a database probe added here would be answered
 * once, at build time, and would go on answering "ok" afterwards. Such a check needs `force-dynamic`.
 */
export function GET(): Response {
  const body: HealthResponse = { status: 'ok' };

  return Response.json(body);
}
