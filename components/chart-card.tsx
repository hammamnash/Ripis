import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import type { BreakdownRow } from "@/src/server/reports/category-breakdown";

/*
 * §12: ranked bars, ordered by the server, which is the only place that knows the whole period's total.
 *
 * Bars are drawn against the largest row rather than against the total, so the tail stays visible; the
 * amounts carry the absolute size. `Number(share)` sizes a box and states nothing — every figure shown comes
 * from the server's decimal sum (ADR-0031).
 */
export function ChartCard({
  title,
  rows,
  folded = 0,
  currency,
}: {
  title: string;
  rows: BreakdownRow[];
  /** The tail the server left out of `rows`, when it folded one. Optional: most responses rank everything. */
  folded?: number;
  currency: CurrencyDisplay;
}) {
  const largest = rows.reduce((max, row) => Math.max(max, Number(row.share)), 0);

  return (
    <section data-slot="chart-card" className="rounded-[16px] border border-hairline bg-card p-5">
      <h2 className="text-subheading text-ink">{title}</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.map((row) => {
          const width = largest > 0 ? (Number(row.share) / largest) * 100 : 0;
          return (
            <li key={row.categoryId ?? row.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-caption text-ink">{row.name}</span>
                <Amount value={row.total} currency={currency} className="shrink-0 text-caption text-ink" />
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-[9999px] bg-hairline">
                <div
                  className="h-full rounded-[9999px]"
                  style={{ width: `${width}%`, backgroundColor: row.color ?? "var(--color-ash)" }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {folded > 0 ? (
        <p className="mt-3 text-caption text-ash">
          {folded === 1 ? "1 smaller category" : `${folded} smaller categories`}
        </p>
      ) : null}
    </section>
  );
}
