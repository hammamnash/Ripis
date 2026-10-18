import type { Caller } from '../context';
import { ApiError } from '../http/errors';

/**
 * The admin-only acts: creating an account, and resetting somebody else's password (§3, ADR-0013).
 *
 * The check lives here rather than in each route because "who may do this" is a rule, and rules live in
 * `src/server/**` (ADR-0039). A route that forgot the check would be a hole; a service that forgets it
 * is one bug in one place, and the spec in `test/users-*.spec.ts` calls the service directly.
 */
export function requireAdmin(caller: Caller): void {
  if (caller.role !== 'admin') {
    throw new ApiError('forbidden', 403, 'Only an admin can do that.');
  }
}
