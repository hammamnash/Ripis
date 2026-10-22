"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";

export function NetWorthHero({ currency, assets, liabilities, netWorth, walletCount, others }: { currency: CurrencyDisplay; assets: string; liabilities: string; netWorth: string; walletCount: number; others: string[] }) {
  const [hidden, setHidden] = useState(true);
  const counted = walletCount === 1 ? "Across 1 wallet" : `Across ${walletCount} wallets`;
  const mask = hidden ? "••••••" : undefined;
  const amount = (value: string, className: string) => hidden ? <span className={className}>{mask}</span> : <Amount value={value} currency={currency} className={className} markClassName="text-ash-on-panel" />;

  return (
    <section data-slot="net-worth-hero" className="rounded-[20px] bg-panel p-6 text-paper">
      <div className="flex items-center justify-between gap-3">
        <p className="text-micro uppercase text-ash-on-panel">Net worth</p>
        <button type="button" aria-label={hidden ? "Show amounts" : "Hide amounts"} onClick={() => setHidden((value) => !value)} className="flex size-[var(--target-min)] items-center justify-center rounded-pill text-ash-on-panel">
          {hidden ? <Eye aria-hidden className="size-5" /> : <EyeOff aria-hidden className="size-5" />}
        </button>
      </div>
      <p className="mt-3">{amount(netWorth, "font-serif text-display leading-display")}</p>
      <p className="mt-2 text-caption text-ash-on-panel">{counted}{others.length > 0 ? ` · ${others.join(", ")} not converted` : ""}</p>
      <dl className="mt-6 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4"><dt className="text-caption text-ash-on-panel">Assets</dt><dd>{amount(assets, "text-body")}</dd></div>
        <div className="flex items-baseline justify-between gap-4"><dt className="text-caption text-ash-on-panel">Liabilities</dt><dd>{amount(liabilities, "text-body")}</dd></div>
      </dl>
    </section>
  );
}
