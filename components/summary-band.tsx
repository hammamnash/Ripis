import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";

export function SummaryBand({ income, expense, net, currency }: { income: string; expense: string; net: string; currency: CurrencyDisplay }) {
  return (
    <section data-slot="summary-band" className="grid grid-cols-3 border-b border-t border-hairline bg-card px-4 py-4">
      <SummaryCell label="Income" value={income} currency={currency} tone="text-income" />
      <SummaryCell label="Expense" value={expense} currency={currency} tone="text-expense" />
      <SummaryCell label="Net" value={net} currency={currency} tone="text-ink" />
    </section>
  );
}

function SummaryCell({ label, value, currency, tone }: { label: string; value: string; currency: CurrencyDisplay; tone: string }) {
  return <div className="min-w-0 px-2 first:pl-0 last:pr-0"><p className="text-micro uppercase tracking-wide text-ash">{label}</p><Amount value={value} currency={currency} className={`mt-1 truncate text-body ${tone}`} /></div>;
}