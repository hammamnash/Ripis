import { Wallet } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { BudgetBar } from "@/components/budget-bar";
import { DashboardCharts } from "@/components/dashboard-charts";
import { NetWorthHistoryChart } from "@/components/net-worth-history-chart";
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
import { trends } from "@/src/server/reports/trends";
import { netWorthHistory, captureCurrentNetWorth } from "@/src/server/reports/net-worth-history";
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
/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

export default async function DashboardPage() {
  await connection();
  const { caller } = await requireScreenSession();

  const month = calendarDate(new Date()).slice(0, 7);
  const query = readReportQuery(new URLSearchParams({ month }));

  const currentMonth = new Date(`${month}-01T00:00:00Z`);
  const sixMonthsAgo = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 5, 1));
  const nextMonth = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 1));
  const trendTo = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 0));
  const historyFrom = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 5, 1));
  const trendQuery = new URLSearchParams({ from: sixMonthsAgo.toISOString().slice(0, 10), to: trendTo.toISOString().slice(0, 10), granularity: "month", metric: "expense" });
  const data = await runAsCaller(caller, async () => {
    await captureCurrentNetWorth(currentMonth);
    const [summary, budgets, spending, trend, currencies, history] = await Promise.all([
      walletSummary(readReportQuery(new URLSearchParams())),
      listBudgets(readBudgetMonth(new URLSearchParams({ month }))),
      categoryBreakdown(query, "expense"),
      trends({ ...readReportQuery(trendQuery), metric: "expense" }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
      netWorthHistory(historyFrom, nextMonth),
    ]);
    return { summary, budgets, spending, trend, currencies, history };
  });

  /* A currency's key is its code, so this map is keyed by one — `currencyId` on the wire *is* `IDR`. */
  const display = (code: string): CurrencyDisplay => {
    const row = data.currencies.find((currency) => currency.code === code);
    return { symbol: row?.symbol ?? "", suffix: row?.suffix ?? false, minorUnit: row?.minor_unit ?? 2 };
  };

  const primary = display(data.summary.currency);
  const visibleWallets = data.summary.wallets.filter((wallet) => !isZeroMoney(wallet.currentBalance));
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
        <div className="flex items-baseline justify-between"><h2 className="text-subheading text-ink">Wallets</h2><Link href="/wallets" className="text-caption text-ink">All wallets →</Link></div>
        {visibleWallets.length === 0 ? (
          <EmptyState icon={Wallet} title="No wallets yet">
            <Link href="/wallets" className="text-ink underline">
              Add your first wallet
            </Link>{" "}
            to start counting.
          </EmptyState>
        ) : (
          visibleWallets.map((wallet) => (
            <WalletCard key={wallet.id} wallet={wallet} currency={display(wallet.currencyId)} />
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between"><h2 className="text-subheading text-ink">Budgets</h2><Link href="/budgets" className="text-caption text-ink">Budgets →</Link></div>
        {data.budgets.length > 0 ? data.budgets.map((bar) => <BudgetBar key={bar.id} bar={bar} currency={primary} />) : <p className="rounded-[16px] border border-hairline bg-card p-5 text-body text-ash">No budget set for {month}.</p>}
      </section>

      <DashboardCharts spending={data.spending} trend={data.trend.points} currency={primary} monthLabel={month} />
      <NetWorthHistoryChart points={data.history} currency={primary} />
    </div>
  );
}

function isZeroMoney(value: string): boolean {
  return value.replace(/[+\-\.\s]/g, "").split("").every((digit) => digit === "0");
}