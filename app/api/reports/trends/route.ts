import { withCaller } from '../../../../src/server/auth/require-user';
import { readTrendQuery, trends } from '../../../../src/server/reports/trends';

/**
 * A series over the window, with the comparison the dashboard's delta line states (Task 4.3, §8).
 *
 * Two metrics, one shape: `metric=expense` plots a period's expense, `metric=cash-flow` plots what the
 * period did to the user's money. Both replies carry income, expense and net for every point, all as
 * strings, and `granularity=day|month` decides the buckets — days by default for a window of six weeks or
 * less, months beyond it (`src/server/reports/filter.ts`).
 *
 * A day with no transactions comes back as a zero point rather than a gap, which is what makes the series a
 * statement about the window rather than about the rows that happen to exist in it.
 */
export const GET = withCaller(async (request) => {
  return Response.json({ data: await trends(readTrendQuery(new URL(request.url).searchParams)) });
});
