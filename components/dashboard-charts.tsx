import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import type { BreakdownRow } from "@/src/server/reports/category-breakdown";
import type { TrendPoint } from "@/src/server/reports/trends";

function moneyLabel(value: string, currency: CurrencyDisplay) {
  return <Amount value={value} currency={currency} className="text-caption text-ink" />;
}

export function DashboardCharts({ spending, trend, currency, monthLabel }: { spending: { rows: BreakdownRow[]; total: string }; trend: TrendPoint[]; currency: CurrencyDisplay; monthLabel: string }) {
  return <div className="flex flex-col gap-6">
    <section data-slot="spending-category-chart" className="rounded-[16px] border border-hairline bg-card p-5">
      <div className="flex items-baseline justify-between gap-3"><h2 className="text-subheading text-ink">Spending by category</h2><span className="text-caption text-ash">{monthLabel}</span></div>
      <div className="mt-5 flex flex-col items-center">
        <Donut rows={spending.rows} />
        <p className="mt-2 text-caption text-ash">{moneyLabel(spending.total, currency)} total</p>
      </div>
      <ul className="mt-5 flex flex-col gap-3">{spending.rows.map((row, index) => <li key={row.categoryId ?? row.name} className="flex items-center gap-2"><span className="size-3 shrink-0 rounded-pill" style={{ background: `var(--color-chart-${(index % 6) + 1})` }} /><span className="min-w-0 flex-1 truncate text-caption text-ink">{row.name}</span><span className="shrink-0">{moneyLabel(row.total, currency)}</span><span className="w-12 text-right text-caption text-ash">{row.share}%</span></li>)}</ul>
    </section>
    <TrendCard title="Spending trend" points={trend} currency={currency} field="expense" />
    <CashFlowCard points={trend} currency={currency} />
  </div>;
}

function Donut({ rows }: { rows: BreakdownRow[] }) {
  const total = rows.reduce((sum, row) => sum + Number(row.share), 0) || 1;
  return <svg viewBox="0 0 200 200" role="img" aria-label="Spending by category" className="size-52">{rows.map((row, index) => { const share = Number(row.share) / total * 100; const current = rows.slice(0, index).reduce((sum, previous) => sum + Number(previous.share) / total * 100, 0); const dash = `${share} ${100 - share}`; return <circle key={row.categoryId ?? row.name} cx="100" cy="100" r="70" fill="none" stroke={`var(--color-chart-${(index % 6) + 1})`} strokeWidth="30" pathLength="100" strokeDasharray={dash} strokeDashoffset={-current} transform="rotate(-90 100 100)" />; })}<text x="100" y="104" textAnchor="middle" className="fill-ink text-[13px]">{rows.length} categories</text></svg>;
}

function TrendCard({ title, points, currency, field }: { title: string; points: TrendPoint[]; currency: CurrencyDisplay; field: "expense" }) {
  const values = points.map((point) => Number(point[field]));
  const max = Math.max(...values, 1);
  const yTicks = [0, 0.5, 1].map((ratio) => ({ ratio, value: max * ratio }));
  const x = (index: number) => 32 + (index / Math.max(points.length - 1, 1)) * 258;
  const y = (value: number) => 108 - (value / max) * 82;
  const line = points.map((point, index) => `${x(index)},${y(Number(point[field]))}`).join(" ");

  return <section data-slot="spending-trend-chart" className="rounded-[16px] border border-hairline bg-card p-5">
    <div className="flex items-baseline justify-between"><h2 className="text-subheading text-ink">{title}</h2><span className="text-caption text-ash">Last {points.length} months</span></div>
    <div className="relative mt-6 h-56 flex gap-2">
      <div className="flex h-48 w-10 flex-col justify-between text-right text-caption text-ash">{yTicks.slice().reverse().map((tick) => <span key={tick.ratio}>{formatMillions(tick.value)}</span>)}</div>
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-x-0 bottom-8 border-t border-hairline" />
        <svg viewBox="0 0 300 125" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-48 w-full" role="img" aria-label="Monthly spending trend">
          {yTicks.map((tick) => <line key={tick.ratio} x1="0" y1={y(tick.value)} x2="300" y2={y(tick.value)} stroke="var(--color-hairline)" />)}
          <polyline points={line} fill="none" stroke="var(--color-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => <circle key={point.period} cx={x(index)} cy={y(Number(point[field]))} r="3" fill="var(--color-ink)"><title>{`${monthLong(point.period)}: ${formatAmount(point[field], currency)}`}</title></circle>)}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-caption text-ash">{points.map((point) => <span key={point.period}>{monthShort(point.period)}</span>)}</div>
      </div>
    </div>
    <p className="mt-3 text-caption text-ash">Monthly spending · values in millions · hover a point for the month and amount</p>
  </section>;
}

function CashFlowCard({ points, currency }: { points: TrendPoint[]; currency: CurrencyDisplay }) {
  const values = points.map((point) => Number(point.net));
  const max = Math.max(...values.map(Math.abs), 1);
  return <section data-slot="net-cash-flow-chart" className="rounded-[16px] border border-hairline bg-card p-5">
    <div className="flex items-baseline justify-between">
      <h2 className="text-subheading text-ink">Net cash flow</h2>
      <div className="flex gap-3 text-caption text-ash">
        <span><i className="mr-1 inline-block size-2 rounded-pill bg-ink" />Positive</span>
        <span><i className="mr-1 inline-block size-2 rounded-pill bg-negative" />Negative</span>
      </div>
    </div>
    <div className="relative mt-4 h-56">
      <div className="absolute inset-x-0 top-1/2 border-t border-hairline" />
      <div className="flex h-full items-center justify-between gap-2">{points.map((point) => { const value = Number(point.net); const height = Math.max(Math.abs(value) / max * 50, value === 0 ? 0 : 3); 
        return <div key={point.period} className="relative flex h-full flex-1 flex-col items-center">
          <span className={`absolute z-10 whitespace-nowrap rounded-[4px] bg-card px-1 text-micro ${value < 0 ? "top-[calc(50%-10px)] text-negative" : "bottom-[calc(50%-10px)] text-ink"}`}>{formatMillions(value)}</span>
            <div className={`absolute w-full max-w-8 rounded-[4px] ${value < 0 ? "top-1/2 bg-negative" : "bottom-1/2 bg-ink"}`} style={{ height: `${height}%` }}>
              <title>{`${monthLong(point.period)}: ${formatAmount(point.net, currency)}`}</title>
            </div>
          <span className="absolute bottom-0 text-micro text-ash">{monthShort(point.period)}</span>
        </div>; })}
      </div>
    </div>
    <p className="mt-3 text-caption text-ash">Income minus expense · values in millions · hover a bar for the month and amount</p>
  </section>;
}

function formatMillions(value: number) {
  const millions = value / 1_000_000;
  return `${millions.toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
}

function formatAmount(value: string, currency: CurrencyDisplay) {
  const numeric = Number(value);
  return `${currency.symbol}${numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function monthShort(period: string) { return new Date(`${period}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }); }
function monthLong(period: string) { return new Date(`${period}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); }
