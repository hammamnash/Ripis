import { describe, expect, it } from 'vitest';

import { ApiError, errorResponse } from './errors';

describe('the one error shape', () => {
  it('renders an ApiError under its own status and code', async () => {
    const response = errorResponse(
      new ApiError('invalid_refresh_token', 401, 'That refresh token is no longer valid.'),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_refresh_token',
        message: 'That refresh token is no longer valid.',
      },
    });
  });

  it('names the field when the refusal is about one', async () => {
    const response = errorResponse(
      new ApiError('validation_failed', 400, 'A new password is required.', 'newPassword'),
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'validation_failed',
        message: 'A new password is required.',
        field: 'newPassword',
      },
    });
  });

  it('tells the client nothing about a bug', async () => {
    const response = errorResponse(new Error('connect ECONNREFUSED 127.0.0.1:5433'));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong.' },
    });
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});
