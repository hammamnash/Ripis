import { Prisma, type CategoryType } from '@prisma/client';

import { db } from '../db';
import { ApiError } from '../http/errors';
import { money } from '../money/amount';
import { changeBetween, type Change } from '../money/change';
import { addDays, calendarDate } from '../time/calendar-date';
import { primaryCurrency } from '../currency';
import { oneOf, parseReportFilter, previousWindow, reportWhere, type ReportQuery } from './filter';

const KINDS: readonly CategoryType[] = ['expense', 'income'];

/**
 * How many categories a ranked chart draws before the tail is folded into `other` (ADR-0031, §4: six bars
 * plus `Other` is the default form for spending by category, and a pie chart is opt-in).
 *
 * The API does **not** truncate to it. It sends the full ranking *and* the aggregate, because the chart is
 * UI state — a pie chart of the same reply labels every wedge, and a screen that wanted eight bars would
 * otherwise need a different endpoint.
 */
export const RANKED_BARS = 6;

/**
 * One category's tail of a period's spending or earning, and the tail itself.
 *
 * Two things here are the response's reason to exist rather than decoration. Every `total` is the database's
 * sum of the frozen `base_amount`, never a client adding up rows it was sent (ADR-0004, ADR-0031): the
 * ranking is a claim about the whole period, and a client that recomputed it would answer a slightly
 * different question every time a page changed. And `share` is computed here for the same reason `net` is —
 * a percentage a client derived from two money strings would have been through a float to get there.
 */
export interface BreakdownRow {
  categoryId: string | null;
  name: string;
  color: string | null;
  total: string;
  count: number;
  share: string;
}

export interface CategoryBreakdown {
  kind: CategoryType;
  currency: string;
  /** The first day counted, inclusive. */
  from: string;
  /** The last day counted, inclusive. */
  to: string;
  /** Every category's total for the period, which is also the sum of the rows. */
  total: string;
  count: number;
  /** How many categories had rows — `rows.length`, sent so a screen never counts the array itself. */
  categories: number;
  /** The full ranking, largest first. Ties break by name so the order is stable between requests. */
  rows: BreakdownRow[];
  /** Ranks beyond `RANKED_BARS`, aggregated, or `null` when there are none to fold. */
  other: { total: string; count: number; categories: number; share: string } | null;
  /** This period's total against the period of the same length before it (§4's delta line). */
  comparison: Change;
}

interface Ranked {
  categoryId: string | null;
  name: string;
  color: string | null;
  total: Prisma.Decimal;
  count: number;
}

/**
 * Expense by category, or income by category (Task 4.3, §8).
 *
 * `kind` is the report's **subject**, not one of its filters: expenses and income are two different
 * questions (where did the money go, and where did it come from), and they are answered by the same query
 * with one word changed. The stored type is `expense` or `income` on the transaction, and a category the
 * caller filed under the other type cannot appear — `prepare.ts` refuses a mismatch at entry, so the two
 * questions can never be answered out of the same row.
 */
export async function categoryBreakdown(query: ReportQuery, kind: CategoryType): Promise<CategoryBreakdown> {
  const filter = parseReportFilter(query);
  const currency = await primaryCurrency();
  const previous = previousWindow(filter);

  const [grouped, earlier] = await Promise.all([
    db.transaction.groupBy({
      by: ['category_id'],
      where: {
        // `deleted_at: null` is stated in the module that sums rather than inherited: a soft-deleted row
        // still has its amounts, so a total that forgot this filter would include money the user removed
        // (ADR-0005).
        ...reportWhere(filter, filter, currency),
        deleted_at: null,
        // `kind` is a narrowing of the type as well as the subject, so a `transactionType` filter can only
        // intersect it: asking for an expense breakdown of income answers with a breakdown of nothing.
        AND: { transaction_type: kind },
      },
      _sum: { base_amount: true },
      _count: { _all: true },
    }),
    db.transaction.groupBy({
      by: ['transaction_type'],
      where: { ...reportWhere(filter, previous, currency), deleted_at: null, AND: { transaction_type: kind } },
      _sum: { base_amount: true },
    }),
  ]);

  const ranked = await rank(grouped);
  const grand = ranked.reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0));
  const grandCount = ranked.reduce((sum, row) => sum + row.count, 0);
  const tail = ranked.slice(RANKED_BARS);
  const tailTotal = tail.reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0));
  const previousTotal = earlier[0]?._sum.base_amount ?? new Prisma.Decimal(0);

  return {
    kind,
    currency,
    from: calendarDate(filter.from),
    to: calendarDate(addDays(filter.to, -1)),
    total: money(grand),
    count: grandCount,
    categories: ranked.length,
    rows: ranked.map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      color: row.color,
      total: money(row.total),
      count: row.count,
      share: shareOf(row.total, grand),
    })),
    other:
      tail.length === 0
        ? null
        : {
            total: money(tailTotal),
            count: tail.reduce((sum, row) => sum + row.count, 0),
            categories: tail.length,
            share: shareOf(tailTotal, grand),
          },
    comparison: changeBetween(grand, previousTotal),
  };
}

/** The kind a breakdown is of, read off the query and refused by name when it is neither. */
export function readBreakdownKind(text: string | undefined): CategoryType {
  if (text === undefined || text === '') {
    throw new ApiError('validation_failed', 400, 'kind is required.', 'kind');
  }

  return oneOf(text, KINDS, 'kind');
}

/**
 * The category names behind the grouping, fetched in one read rather than per row, and folded to a ranking
 * largest first.
 *
 * A row whose `category_id` is null names itself `Uncategorised` rather than disappearing. Nothing in this
 * application writes an income or expense row without a category — `prepare.ts` refuses it — so this is a
 * shape only an import or a repair could produce, and dropping it would make the ranking disagree with the
 * total it sits under.
 */
async function rank(
  grouped: { category_id: string | null; _sum: { base_amount: Prisma.Decimal | null }; _count: { _all: number } }[],
): Promise<Ranked[]> {
  const ids = grouped.map((row) => row.category_id).filter((id): id is string => id !== null);
  const categories =
    ids.length === 0
      ? []
      : await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, color: true } });
  const named = new Map(categories.map((category) => [category.id, category]));

  return grouped
    .map((row) => {
      const category = row.category_id === null ? undefined : named.get(row.category_id);

      return {
        categoryId: row.category_id,
        name: category?.name ?? 'Uncategorised',
        color: category?.color ?? null,
        total: row._sum.base_amount ?? new Prisma.Decimal(0),
        count: row._count._all,
      };
    })
    .sort((left, right) => right.total.cmp(left.total) || left.name.localeCompare(right.name));
}

/** A percentage of one figure in another, to one decimal place, and `0.0` when there is no whole to divide. */
function shareOf(part: Prisma.Decimal, whole: Prisma.Decimal): string {
  return whole.isZero() ? '0.0' : part.dividedBy(whole).times(100).toFixed(1);
}
