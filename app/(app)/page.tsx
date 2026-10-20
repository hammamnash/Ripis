import { Wallet } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { BudgetBar } from "@/components/budget-bar";
import { ChartCard } from "@/components/chart-card";
import { EmptyState } from "@/components/empty-state";
import { NetWorthHero } from "@/components/net-worth-hero";
import { ShellHeader } from "@/components/shell/header";
import { WalletCard } from "@/components/wallet-card";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { listBudgets } from "@/src/server/budgets/list-budgets";
import { readBudgetMonth } from "@/src/server/budgets/month";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { categoryBreakdown } from "@/src/server/reports/category-breakdown";
import { readReportQuery } from "@/src/server/reports/filter";
import { walletSummary } from "@/src/server/reports/wallet-summary";
import { calendarDate } from "@/src/server/time/calendar-date";

/*
 * Screen 1, the Dashboard.
 *
 * The figure on top is the caller's primary currency and nothing else: a net worth that added IDR to USD
 * would need a rate, and this ledger never stores one (ADR-0004). The currencies it leaves out are named on
 * the hero rather than silently dropped.
 *
 * Every number here is read from the module the endpoint calls (ADR-0039) — the page composes, it does not
 * compute. The only arithmetic in this file is a Map lookup for a currency's symbol.
 */
export default async function DashboardPage() {
  await connection();
  const { caller } = await requireScreenSession();

  const month = calendarDate(new Date()).slice(0, 7);
  const query = readReportQuery(new URLSearchParams({ month }));

  const data = await runAsCaller(caller, async () => {
    const [summary, budgets, spending, currencies] = await Promise.all([
      walletSummary(readReportQuery(new URLSearchParams())),
      listBudgets(readBudgetMonth(new URLSearchParams({ month }))),
      categoryBreakdown(query, "expense"),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);
    return { summary, budgets, spending, currencies };
  });

  /* A currency's key is its code, so this map is keyed by one — `currencyId` on the wire *is* `IDR`. */
  const display = (code: string): CurrencyDisplay => {
    const row = data.currencies.find((currency) => currency.code === code);
    return { symbol: row?.symbol ?? "", suffix: row?.suffix ?? false, minorUnit: row?.minor_unit ?? 2 };
  };

  const primary = display(data.summary.currency);
  const others = data.summary.currencies
    .filter((bucket) => !bucket.isPrimary)
    .map((bucket) => bucket.currencyId);

  return (
    <div className="flex flex-col gap-6 pb-6">
      <ShellHeader title="Dashboard" />

      <NetWorthHero
        currency={primary}
        assets={data.summary.assets}
        liabilities={data.summary.liabilities}
        netWorth={data.summary.netWorth}
        walletCount={data.summary.walletCount}
        others={others}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-subheading text-ink">Wallets</h2>
        {data.summary.wallets.length === 0 ? (
          <EmptyState icon={Wallet} title="No wallets yet">
            <Link href="/wallets" className="text-ink underline">
              Add your first wallet
            </Link>{" "}
            to start counting.
          </EmptyState>
        ) : (
          data.summary.wallets.map((wallet) => (
            <WalletCard key={wallet.id} wallet={wallet} currency={display(wallet.currencyId)} />
          ))
        )}
      </section>

      {data.budgets.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-subheading text-ink">Budgets</h2>
          {data.budgets.map((bar) => (
            <BudgetBar key={bar.id} bar={bar} currency={primary} />
          ))}
        </section>
      ) : null}

      {data.spending.rows.length > 0 ? (
        <ChartCard title="Where it went" rows={data.spending.rows} currency={primary} />
      ) : null}
    </div>
  );
}
