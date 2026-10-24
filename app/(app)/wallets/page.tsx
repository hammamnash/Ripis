import { Wallet } from "lucide-react";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/empty-state";
import { ShellHeader } from "@/components/shell/header";
import { WalletCard } from "@/components/wallet-card";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { readReportQuery } from "@/src/server/reports/filter";
import { walletSummary } from "@/src/server/reports/wallet-summary";
import type { WalletResponse } from "@/src/server/wallets/serialise";

/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

export default async function WalletsPage() {
  await connection();
  const { caller } = await requireScreenSession();

  const data = await runAsCaller(caller, async () => {
    const [summary, currencies] = await Promise.all([
      walletSummary(readReportQuery(new URLSearchParams())),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);
    return { summary, currencies };
  });

  const display = (code: string): CurrencyDisplay => {
    const row = data.currencies.find((entry) => entry.code === code);
    return row
      ? { symbol: row.symbol, suffix: row.suffix, minorUnit: row.minor_unit }
      : { symbol: code, suffix: false, minorUnit: 2 };
  };

  const primary = display(data.summary.currency);
  const assets = data.summary.wallets.filter((wallet) => !wallet.isLiability);
  const liabilities = data.summary.wallets.filter((wallet) => wallet.isLiability);

  return (
    <>
      <ShellHeader title="Wallets" />

      {data.summary.wallets.length === 0 ? (
        <div className="px-4 py-10 md:px-6">
          <EmptyState icon={Wallet} title="No wallets yet">
            A wallet is where money sits. Add one and the totals below start meaning something.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-6 px-4 pb-10 pt-2 md:px-6 md:pb-12 md:pt-4">
          <div
            data-slot="net-worth-line"
            className="flex items-baseline justify-between gap-3 rounded-[16px] border border-hairline bg-card px-4 py-3"
          >
            <span className="text-caption text-ash">Net worth</span>
            <Amount value={data.summary.netWorth} currency={primary} className="text-subheading text-ink" />
          </div>

          <WalletGroup title="Assets" wallets={assets} display={display} />
          <WalletGroup title="Liabilities" wallets={liabilities} display={display} />
        </div>
      )}
    </>
  );
}

/** One heading per side of the balance sheet: an asset and a liability are not the same kind of number. */
function WalletGroup({
  title,
  wallets,
  display,
}: {
  title: string;
  wallets: WalletResponse[];
  display: (code: string) => CurrencyDisplay;
}) {
  if (wallets.length === 0) return null;
  return (
    <section data-slot="wallet-group" className="flex flex-col gap-3">
      <h2 className="text-caption uppercase text-ash">{title}</h2>
      {/* Two across from 768px up: a wallet card is a name and a figure, which leaves a phone's worth of
          width empty on a desktop column. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {wallets.map((wallet) => (
          <WalletCard key={wallet.id} wallet={wallet} currency={display(wallet.currencyId)} />
        ))}
      </div>
    </section>
  );
}
