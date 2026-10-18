import type { RateLimitRule } from '../rate-limit';
import { clientIp } from '../http/request';

/**
 * How fast an attempt may be repeated. Policy, so it lives here rather than in a route, and these
 * numbers are written down in `02-context.md` §6.1 with the endpoints they protect.
 *
 * Two keys guard sign-in, and they fail differently: the per-account rule stops one password being
 * guessed against one address; the per-address rule stops one machine walking a list of addresses.
 * Neither replaces the audit row, which is the record that survives a restart.
 */

export const LOGIN_PER_ACCOUNT: RateLimitRule = { limit: 5, windowMs: 60_000 };
export const LOGIN_PER_ADDRESS: RateLimitRule = { limit: 10, windowMs: 60_000 };
export const REFRESH_PER_ADDRESS: RateLimitRule = { limit: 30, windowMs: 60_000 };
export const PASSWORD_PER_ACCOUNT: RateLimitRule = { limit: 10, windowMs: 60_000 };

/** Keyed on the address as submitted, lowercased, so changing its case does not reset the budget. */
export function accountKey(scope: string, identifier: string): string {
  return `${scope}:account:${identifier.trim().toLowerCase()}`;
}

export function addressKey(scope: string, request: Request): string {
  return `${scope}:address:${clientIp(request)}`;
}
