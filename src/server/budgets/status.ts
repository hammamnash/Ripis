import { Prisma } from '@prisma/client';

/**
 * The one table that says what a budget's percentage means (FR-10, §10, Task 5.2).
 *
 * The thresholds are §10's, and the ambiguity §10 left is closed deliberately: **exactly 100% is yellow,
 * not red.** Yellow means "at or past the limit you set"; red means "past it". A bar sitting exactly on its
 * budget has not exceeded anything, and calling that red would make "over budget" mean "at budget" — the
 * one reading of a budget bar nobody holds.
 *
 * **The percentage is rounded before it is compared.** That is the single place this module departs from
 * the illustration in the plan, and it is what makes the status and the printed figure agree by
 * construction rather than by luck: comparing the raw ratio would let a bar read `80.00%` in
 * `--color-positive` for any spend between 79.995% and 79.9999%, and §15 puts a word beside every colour
 * precisely so the two are read together. Every boundary the plan names still holds — 79.99% green,
 * 80.00% yellow, 99.99% yellow, 100.00% yellow, 100.01% red.
 *
 * The token is sent as the CSS custom-property *name* rather than a colour, because dark and light are
 * separate tokens whose values differ on purpose (ADR-0009): resolving the name in the client is what lets
 * one payload theme itself, and a hex value here would be the light theme hard-coded into the API.
 */

export const BUDGET_STATUSES = ['green', 'yellow', 'red'] as const;

export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

/** Where a bar becomes worth restating at the top of the screen (§10). */
export const BUDGET_ALERT_THRESHOLD = 80;

const HUNDRED = new Prisma.Decimal(100);
const ALERT_AT = new Prisma.Decimal(BUDGET_ALERT_THRESHOLD);

const TOKENS: Record<BudgetStatus, string> = {
  green: '--color-positive',
  yellow: '--color-warning',
  red: '--color-negative',
};

export interface BudgetStanding {
  /** Two decimal places. A decimal operation, not a locale one — formatting is the client's job (ADR-0026). */
  percent: string;
  status: BudgetStatus;
  /** The word beside the colour, so status is never carried by colour alone (§15). */
  label: string;
  /** The design token the client resolves for its theme (ADR-0009). */
  token: string;
}

/**
 * `used / budget` as a percentage, at the precision it is compared *and* displayed at.
 *
 * A budget of zero throws rather than returning a number. The table carries `CHECK (amount > 0)` and both
 * `createBudget` and `updateBudget` refuse one, so this is unreachable through the API — which is exactly
 * why it is a plain `Error` and not an `ApiError`: a zero here means a row arrived some other way, and
 * that is a defect to surface as a 500, not a thing to report to the caller as their mistake.
 */
export function budgetPercent(used: Prisma.Decimal, budget: Prisma.Decimal): Prisma.Decimal {
  if (budget.lessThanOrEqualTo(0)) {
    throw new Error(
      'A budget of zero has no percentage: it would be a confident status computed from nothing. ' +
        'CHECK (amount > 0) and the create/update paths should have made this unreachable.',
    );
  }

  return used.dividedBy(budget).times(HUNDRED).toDecimalPlaces(2);
}

function statusOf(percent: Prisma.Decimal): BudgetStatus {
  if (percent.lessThan(ALERT_AT)) return 'green';
  if (percent.lessThanOrEqualTo(HUNDRED)) return 'yellow';

  return 'red';
}

function labelOf(status: BudgetStatus, percent: Prisma.Decimal): string {
  if (status === 'green') return 'On track';
  if (status === 'red') return 'Over budget';

  // Exactly on the limit is its own sentence. "Approaching limit" would be untrue at 100% — the limit is
  // not approaching, it has been reached — and that distinction is the whole reason 100% is yellow.
  return percent.equals(HUNDRED) ? 'Spent, not exceeded' : 'Approaching limit';
}

/**
 * Everything a Budget Bar needs to show one budget's state.
 *
 * The only place the table above is consulted. `budgetStatus` delegates here rather than repeating the
 * comparisons, so a colour and a word can never disagree about the same pair of numbers.
 */
export function budgetStanding(used: Prisma.Decimal, budget: Prisma.Decimal): BudgetStanding {
  const percent = budgetPercent(used, budget);
  const status = statusOf(percent);

  return {
    percent: percent.toFixed(2),
    status,
    label: labelOf(status, percent),
    token: TOKENS[status],
  };
}

/** The colour alone, for a caller that has no use for the rest. */
export function budgetStatus(used: Prisma.Decimal, budget: Prisma.Decimal): BudgetStatus {
  return budgetStanding(used, budget).status;
}

/** Whether a standing is worth restating at the top of the screen — every non-green one is (§10). */
export function isAlert(standing: BudgetStanding): boolean {
  return standing.status !== 'green';
}
