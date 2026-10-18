import { withCaller } from '../../../../src/server/auth/require-user';
import { categoryBreakdown, readBreakdownKind } from '../../../../src/server/reports/category-breakdown';
import { readReportQuery } from '../../../../src/server/reports/filter';

/**
 * Spending or earning by category, ranked (Task 4.3, §8).
 *
 * `kind` says which of the two questions this is — where the money went, or where it came from — and it is
 * required rather than defaulted: a report that guessed would answer the other one and look plausible.
 *
 * The reply carries the **full ranking plus the `other` aggregate**, and never a truncated top six, because
 * ADR-0031 makes six bars plus `Other` the default *form* — a chart choice, not a different endpoint. Every
 * total in it is the sum the database computed over `base_amount`, so a screen drawing the chart never adds
 * a figure of its own (ADR-0004, ADR-0031).
 */
export const GET = withCaller(async (request) => {
  const query = new URL(request.url).searchParams;

  return Response.json({
    data: await categoryBreakdown(readReportQuery(query), readBreakdownKind(query.get('kind') ?? undefined)),
  });
});
