import { ApiError } from '../http/errors';

/**
 * The one place a password's minimum is decided.
 *
 * Both acts that set a password ask this file: a user changing their own (ADR-0045) and an admin
 * provisioning an account (Task 2.5). Two copies of the number would drift, and the drift would only
 * surface as an account that cannot be created with a password the settings screen happily accepts.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function assertPasswordIsLongEnough(password: string, field: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(
      'validation_failed',
      400,
      `A password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      field,
    );
  }
}
