import type { CurrencyDisplay } from "@/src/lib/display-money";
import type { NetWorthHistoryPoint } from "@/src/server/reports/net-worth-history";

export function NetWorthHistoryChart({ points, currency }: { points: NetWorthHistoryPoint[]; currency: CurrencyDisplay }) {
  if (points.length === 0) return <section className="rounded-[16px] border border-hairline bg-card p-5 text-body text-ash">Net-worth history will appear after the first monthly snapshot.</section>;
  const values = points.map((point) => Number(point.netWorth));
  const min = Math.min(...values, 0); const max = Math.max(...values, 1); const span = max - min || 1;
  const yTicks = [min, min + span / 2, max];
  const x = (index: number) => (index / Math.max(points.length - 1, 1)) * 300;
  const y = (value: number) => 100 - ((value - min) / span) * 78;
  const line = points.map((point, index) => `${x(index)},${y(Number(point.netWorth))}`).join(" ");
  return <section data-slot="net-worth-history-chart" className="rounded-[16px] border border-hairline bg-card p-5">
    <div className="flex items-baseline justify-between"><h2 className="text-subheading text-ink">Net worth trend</h2><span className="text-caption text-ash">Last {points.length} months</span></div>
    <div className="relative mt-6 h-56 flex gap-2">
      <div className="flex h-48 w-10 flex-col justify-between text-right text-caption text-ash">{yTicks.slice().reverse().map((tick) => <span key={tick}>{formatMillions(tick)}</span>)}</div>
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-x-0 bottom-8 border-t border-hairline" />
        <svg viewBox="0 0 300 125" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-48 w-full" role="img" aria-label="Monthly net worth trend">
          {yTicks.map((tick) => <line key={tick} x1="0" y1={y(tick)} x2="300" y2={y(tick)} stroke="var(--color-hairline)" />)}
          <polyline points={line} fill="none" stroke="var(--color-ink)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => <circle key={point.month} cx={x(index)} cy={y(Number(point.netWorth))} r="3.5" fill="var(--color-ink)"><title>{`${monthLong(point.month)}: ${formatAmount(point.netWorth, currency)}`}</title></circle>)}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-caption text-ash">{points.map((point) => <span key={point.month}>{monthLong(point.month).slice(0, 3)}</span>)}</div>
      </div>
    </div>
    <p className="mt-3 text-caption text-ash">Monthly net worth · hover a point for the month and amount</p>
  </section>;
}

function formatMillions(value: number) {
  return `${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
}

function formatAmount(value: string, currency: CurrencyDisplay) { return `${currency.symbol}${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`; }
function monthLong(period: string) { return new Date(`${period}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); }
