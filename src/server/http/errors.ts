/**
 * The one error shape the API speaks (`02-context.md` §6.1). A route handler never composes an error
 * body itself — it throws, and `errorResponse` renders. Anything that is not an `ApiError` is a bug,
 * so the client is told nothing about it: no message, no stack, no driver text. The detail goes to the
 * server log instead, and nothing that could be a password or a token is ever put there.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const INTERNAL_ERROR_MESSAGE = 'Something went wrong.';

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const body: { code: string; message: string; field?: string } = {
      code: error.code,
      message: error.message,
    };
    if (error.field) body.field = error.field;

    return Response.json({ error: body }, { status: error.status });
  }

  console.error('[api] unhandled:', error instanceof Error ? error.message : error);

  return Response.json(
    { error: { code: 'internal_error', message: INTERNAL_ERROR_MESSAGE } },
    { status: 500 },
  );
}
