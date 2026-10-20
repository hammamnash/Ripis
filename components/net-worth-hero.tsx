import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";

/*
 * §5 "Net Worth Hero": the inverted band, the figure in serif display, the asset/liability split beneath.
 *
 * §5 also allows a delta line ("vs last month"). It is absent on purpose: this ledger stores a balance as a
 * current value (ADR-0059), so there is no last month's net worth to compare against, and a percentage
 * derived from anything else would be the one figure on the screen nobody could check. It comes back when
 * balances are snapshotted, not before.
 */
export function NetWorthHero({
  currency,
  assets,
  liabilities,
  netWorth,
  walletCount,
  others,
}: {
  currency: CurrencyDisplay;
  assets: string;
  liabilities: string;
  netWorth: string;
  walletCount: number;
  /** Names of the other currencies the ledger holds. They are excluded from the figure, so they are said. */
  others: string[];
}) {
  const counted = walletCount === 1 ? "Across 1 wallet" : `Across ${walletCount} wallets`;

  return (
    <section data-slot="net-worth-hero" className="rounded-[20px] bg-panel p-6 text-paper">
      <p className="text-micro uppercase text-ash-on-panel">Net worth</p>
      <p className="mt-3">
        <Amount
          value={netWorth}
          currency={currency}
          className="font-serif text-display leading-display"
          markClassName="text-ash-on-panel"
        />
      </p>
      <p className="mt-2 text-caption text-ash-on-panel">
        {counted}
        {others.length > 0 ? ` · ${others.join(", ")} not converted` : ""}
      </p>
      <dl className="mt-6 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-caption text-ash-on-panel">Assets</dt>
          <dd>
            <Amount value={assets} currency={currency} className="text-body" markClassName="text-ash-on-panel" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-caption text-ash-on-panel">Liabilities</dt>
          <dd>
            <Amount value={liabilities} currency={currency} className="text-body" markClassName="text-ash-on-panel" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
