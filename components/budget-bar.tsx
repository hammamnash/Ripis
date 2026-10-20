import { Amount } from "@/components/amount";
import { percentText, type CurrencyDisplay } from "@/src/lib/display-money";
import type { BudgetStatus } from "@/src/server/budgets/status";
import type { BudgetBarResponse } from "@/src/server/budgets/usage";

/*
 * §5 "Budget Bar": track, fill, and the numeric label that makes the colour optional.
 *
 * The fill and the track both resolve the server's own token (ADR-0009), so a bar cannot disagree with the
 * theme, and the track is that token mixed down rather than a second colour to keep in sync in two themes.
 *
 * `Number(percent)` is the one float on this screen and it is not money: `percent` is a ratio the server
 * already computed from decimals (ADR-0012), used here to size a box, never to state an amount.
 */
export function BudgetBar({ bar, currency }: { bar: BudgetBarResponse; currency: CurrencyDisplay }) {
  const ratio = Number(bar.percent);
  const width = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 100) : 0;
  const token = `var(${bar.token})`;

  return (
    <div data-slot="budget-bar" data-status={bar.status satisfies BudgetStatus} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-body text-ink">{bar.categoryName}</p>
        <p className="shrink-0 text-caption tabular-nums" style={{ color: token }}>
          {percentText(bar.percent)} · {bar.label}
        </p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-[9999px]"
        style={{ backgroundColor: `color-mix(in oklab, ${token} 16%, transparent)` }}
      >
        <div className="h-full rounded-[9999px]" style={{ width: `${width}%`, backgroundColor: token }} />
      </div>
      <p className="text-caption text-ash">
        <Amount value={bar.used} currency={currency} /> of <Amount value={bar.amount} currency={currency} />
      </p>
    </div>
  );
}
