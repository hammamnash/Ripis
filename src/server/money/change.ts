import type { Prisma } from '@prisma/client';

import { money } from './amount';

export interface Change {
  current: string;
  previous: string;
  change: string;
  changePercent: string | null;
  direction: 'up' | 'down' | 'flat';
}

/**
 * One figure against the figure for the period before it — the design's "↑ 2.4% vs last month" (§4), which
 * every trend and every ranked total states rather than leaves to a screen.
 *
 * The percentage is computed here for the reason every derived figure is: a client that divided two money
 * strings would have been through a float by the time it had an answer, and the reply would carry no trace
 * of the number it actually divided. `Decimal.dividedBy` keeps the arithmetic checkable from the two
 * figures that came with it.
 *
 * `changePercent` is **`null` rather than `0`** when the previous period was zero, because "up 0%" and
 * "there was nothing before this to compare with" are different sentences and only one of them is true.
 *
 * `direction` is deliberately **neutral** — for an expense, up is bad and for income it is good, and that
 * judgement belongs to the theme the screen is rendering, not to a report (ADR-0026).
 */
export function changeBetween(current: Prisma.Decimal, previous: Prisma.Decimal): Change {
  const change = current.minus(previous);
  const compared = current.cmp(previous);

  return {
    current: money(current),
    previous: money(previous),
    change: money(change),
    changePercent: previous.isZero() ? null : change.dividedBy(previous).times(100).toFixed(1),
    direction: compared === 0 ? 'flat' : compared > 0 ? 'up' : 'down',
  };
}
