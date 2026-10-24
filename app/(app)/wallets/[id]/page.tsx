import { List } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/empty-state";
import { LedgerPager } from "@/components/ledger-pager";
import { MonthSelector, monthLabel } from "@/components/month-selector";
import { ReconcileForm } from "@/components/reconcile-form";
import { ShellHeader } from "@/components/shell/header";
import { SummaryBand } from "@/components/summary-band";
import { TransactionDayList } from "@/components/transaction-day-list";
import { Button } from "@/components/ui/button";
import { Chip, ChipCount } from "@/components/ui/chip";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { readReportQuery } from "@/src/server/reports/filter";
import { monthSummary } from "@/src/server/reports/month-summary";
import { addDays, calendarDate, monthWindow, parseCalendarDate } from "@/src/server/time/calendar-date";
import { listTransactions, MAX_PER_PAGE } from "@/src/server/transactions/read-transactions";
import { getWallet } from "@/src/server/wallets/list-wallets";

const LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank Account",
  e_wallet: "E-Wallet",
  credit_card: "Credit Card",
  investment: "Investment Account",
  other: "Other",
};

/** The chip row's fixed vocabulary, the same one the transactions list uses. */
const TYPE_CHIPS = ["expense", "income", "transfer"] as const;

/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

/*
 * Screen 7 (§7): a wallet's balance, its reconciliation, and **its own** ledger.
 *
 * The ledger is screen 2 narrowed to one wallet — the month selector, the inverted band, the type chips and
 * the day-grouped rows are the same components, drawing the same figures over a `walletId`. Two things say
 * "this wallet" rather than repeating the filter on every control: the ledger lists both legs of a movement
 * (`wallet_id` OR `destination_wallet_id`), so money that arrived is in it as well as money that left, and
 * `monthSummary` is given the same narrowing so the band's In / Out / Net add up the rows on screen.
 *
 * The wallet name is dropped from each row's meta line — the title already says it — while a transfer keeps
 * both ends, because where the money went is not in the title.
 *
 * The month lives in `?month=yyyy-mm` and the type in `?type=`, for the reasons screen 2 gives: a reload
 * reproduces the view, the back button steps through it, and the chips work before hydration. An
 * unparseable value falls back to the current month (or to all types) rather than throwing — a hand-edited
 * query string is not a server error.
 */
export default async function WalletDetailPage({ params, searchParams }: PageProps<"/wallets/[id]">) {
  await connection();
  const { caller } = await requireScreenSession();
  const { id } = await params;
  const query = await searchParams;

  const today = calendarDate(new Date());
  const requestedMonth = typeof query.month === "string" ? query.month : undefined;
  const month =
    requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7);

  /* A page number is a hand-editable query string, so it is clamped here rather than trusted. */
  const requestedPage = typeof query.page === "string" ? Number(query.page) : 1;
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const requestedType = typeof query.type === "string" ? query.type : "";
  const typeFilter = (TYPE_CHIPS as readonly string[]).includes(requestedType) ? requestedType : "";

  const window = monthWindow(parseCalendarDate(`${month}-01`, "month"));
  const from = calendarDate(window.from);
  const to = calendarDate(addDays(window.to, -1));

  const data = await runAsCaller(caller, async () => {
    /* A balance is the wallet module's to state, not a column a screen may read; the invariant suite
       pins that column to the server layer, and this page is why the pin exists. */
    const wallet = await getWallet(id);
    if (!wallet) return null;

    const [listed, summary, counts, wallets, categories, currencies] = await Promise.all([
      listTransactions({
        from,
        to,
        walletId: id,
        page,
        /* The Transfer chip is one control for two row types: an exchange moved money between two
           currencies and belongs with the transfers, exactly as the mockup's own count does. */
        type: typeFilter === "transfer" ? undefined : typeFilter || undefined,
        typeIn: typeFilter === "transfer" ? ["transfer", "exchange"] : undefined,
        perPage: MAX_PER_PAGE,
      }),
      /* The same filter object the list is narrowed with, so the band cannot report a different wallet's
         month than the rows beneath it. */
      monthSummary(readReportQuery(new URLSearchParams({ month, walletId: id }))),
      /* The chips count the **month**, not the filtered result — a count that moved with the filter would
         make "Expense 35" mean "35 of the rows you can already see". */
      db.transaction.groupBy({
        by: ["transaction_type"],
        where: {
          deleted_at: null,
          occurred_on: { gte: window.from, lt: window.to },
          OR: [{ wallet_id: id }, { destination_wallet_id: id }],
        },
        _count: { _all: true },
      }),
      /* Every live wallet, because a transfer's other end has to be named by something. */
      db.wallet.findMany({ where: { deleted_at: null }, select: { id: true, name: true, currency_id: true } }),
      db.category.findMany({
        where: { archived_at: null },
        select: { id: true, name: true, color: true, icon: true, type: true },
      }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);

    return { wallet, listed, summary, counts, wallets, categories, currencies };
  });

  if (!data) notFound();

  const display = (code: string): CurrencyDisplay => {
    const row = data.currencies.find((entry) => entry.code === code);
    return row
      ? { symbol: row.symbol, suffix: row.suffix, minorUnit: row.minor_unit }
      : { symbol: code, suffix: false, minorUnit: 2 };
  };

  const { wallet } = data;

  const countOf = (type: string): number =>
    data.counts.find((row) => row.transaction_type === type)?._count._all ?? 0;
  const allCount = data.counts.reduce((total, row) => total + row._count._all, 0);

  const chips: { value: string; label: string; count: number }[] = [
    { value: "", label: "All", count: allCount },
    { value: "expense", label: "Expense", count: countOf("expense") },
    { value: "income", label: "Income", count: countOf("income") },
    { value: "transfer", label: "Transfer", count: countOf("transfer") + countOf("exchange") },
  ];

  const walletName = new Map(data.wallets.map((row) => [row.id, row.name]));
  const walletCurrency = new Map(data.wallets.map((row) => [row.id, row.currency_id]));
  const categories = new Map(
    data.categories.map((row) => [row.id, { name: row.name, color: row.color, icon: row.icon }]),
  );

  const pagerQuery: Record<string, string> = { month };
  if (typeFilter) pagerQuery.type = typeFilter;

  const emptySentence =
    page > 1
      ? "That page is past the end of the month. Step back with the pager below."
      : typeFilter
        ? `No ${typeFilter} rows touched this wallet in ${monthLabel(month)}. Widen the filter to see the rest.`
        : `Nothing touched this wallet in ${monthLabel(month)}.`;

  return (
    <>
      <ShellHeader title={wallet.name}>
        <MonthSelector month={month} basePath={`/wallets/${wallet.id}`} currentMonth={today.slice(0, 7)} />
      </ShellHeader>

      <div className="flex flex-col gap-6 px-4 pb-10 pt-2 md:px-6 md:pb-12 md:pt-4">
        <section
          data-slot="wallet-headline"
          className="flex flex-col gap-1 rounded-[16px] border border-hairline bg-card px-4 py-4"
        >
          <p className="text-caption text-ash">
            {LABELS[wallet.walletType] ?? wallet.walletType}
            {wallet.isLiability ? " · owed" : ""}
          </p>
          <Amount
            value={wallet.currentBalance}
            currency={display(wallet.currencyId)}
            className="text-subheading text-ink"
          />
        </section>

        {/* §7 screen 8 composed into screen 7, which lists "reconciliation" as part of it. The form
            takes the figure getWallet already projected — never the stored column — so the screen
            reconciles against the same number it shows. */}
        <ReconcileForm
          walletId={wallet.id}
          walletName={wallet.name}
          isLiability={wallet.isLiability}
          recordedBalance={wallet.currentBalance}
          currency={display(wallet.currencyId)}
          categories={data.categories}
          today={calendarDate(new Date())}
        />

        <SummaryBand
          income={data.summary.income}
          expense={data.summary.expense}
          net={data.summary.net}
          currency={display(data.summary.currency)}
        />

        <form
          data-slot="wallet-ledger-filters"
          method="get"
          action={`/wallets/${wallet.id}`}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="month" value={month} />

          <div
            role="group"
            aria-label="Filter by type"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:-mx-6 md:px-6"
          >
            {chips.map((chip) => (
              <Chip
                key={chip.value || "all"}
                type="submit"
                name="type"
                value={chip.value}
                selected={typeFilter === chip.value}
              >
                {chip.label}
                <ChipCount>{chip.count}</ChipCount>
              </Chip>
            ))}
          </div>
        </form>

        {data.listed.data.length === 0 ? (
          <EmptyState
            icon={List}
            title={`Nothing here for ${monthLabel(month)}`}
            action={
              <Button asChild>
                <Link href="/transactions/new">Add transaction</Link>
              </Button>
            }
          >
            {emptySentence}
          </EmptyState>
        ) : (
          <TransactionDayList
            rows={data.listed.data}
            walletName={walletName}
            walletCurrency={walletCurrency}
            categories={categories}
            display={display}
            walletInMeta={false}
          />
        )}
      </div>

      <LedgerPager
        page={data.listed.page}
        totalPages={data.listed.totalPages}
        basePath={`/wallets/${wallet.id}`}
        query={pagerQuery}
      />
    </>
  );
}
