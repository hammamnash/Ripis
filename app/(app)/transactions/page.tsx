import { List } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { EmptyState } from "@/components/empty-state";
import { LedgerPager } from "@/components/ledger-pager";
import { MonthSelector, monthLabel } from "@/components/month-selector";
import { SummaryBand } from "@/components/summary-band";
import { TransactionDayList } from "@/components/transaction-day-list";
import { TransactionSearch } from "@/components/transaction-search";
import { ShellHeader } from "@/components/shell/header";
import { Button } from "@/components/ui/button";
import { Chip, ChipCount } from "@/components/ui/chip";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { calendarDate, parseCalendarDate } from "@/src/server/time/calendar-date";
import { listTransactions, MAX_PER_PAGE } from "@/src/server/transactions/read-transactions";
import { readReportQuery } from "@/src/server/reports/filter";
import { monthSummary } from "@/src/server/reports/month-summary";

/*
 * Screen 2 (Â§7), composed from mockup 001: month selector, the inverted summary band, a filter chip row with
 * counts, then hairline-separated rows.
 *
 * The month lives in `?month=yyyy-mm` rather than in component state, so the current view is a URL: a reload
 * reproduces it, the back button steps through it, and the e2e suite can assert a month change without typing.
 * An unparseable value falls back to the current month instead of throwing â€” a hand-edited query string is not
 * a server error, and `calendarDate` is the app's one notion of "today" (UTC, ADR-0007). The type filter is a
 * URL for the same reason, which is why the chip row is a `method="get"` form of submit buttons and not a
 * client-side filter: the same HTML works before hydration and the browser's back button steps through filters.
 *
 * The rows arrive with ids and no names, so this screen joins them. That join is the page's job: the list
 * module knows nothing about what a wallet is called, and the row knows nothing about the database.
 *
 * **Days are kept** â€” `TransactionDayList` groups them, which is the same component a wallet's own ledger
 * draws with its wallet column dropped (screen 7).
 */
/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

/** The chip row's fixed vocabulary. `transfer` covers `exchange` too â€” see the `typeIn` note below. */
const TYPE_CHIPS = ["expense", "income", "transfer"] as const;

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  /* Request data, twice over: `searchParams` and the fallback month, which is whatever month it is now. Next
     still attempted a prerender pass here and logged `unstable value new Date()` for every navigation to this
     screen â€” the frame declares `connection()` for itself, and a page has to say it for its own reads. */
  await connection();

  const { caller } = await requireScreenSession();
  const params = await searchParams;
  const today = calendarDate(new Date());
  const requested = typeof params.month === "string" ? params.month : undefined;
  const month =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : today.slice(0, 7);

  /* A page number is a hand-editable query string, so it is clamped here rather than trusted: the list module
     would happily ask Postgres for skip = -1. */
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const pick = (key: string): string => (typeof params[key] === "string" ? String(params[key]) : "");

  const requestedType = pick("type");
  const typeFilter = (TYPE_CHIPS as readonly string[]).includes(requestedType) ? requestedType : "";
  const walletFilter = pick("wallet");
  const categoryFilter = pick("category");
  const search = pick("q");
  const activeFilters = Boolean(typeFilter || walletFilter || categoryFilter || search);

  const from = `${month}-01`;
  const to = `${month}-${lastDayOf(month)}`;

  const data = await runAsCaller(caller, async () => {
    const [listed, summary, counts, wallets, categories, currencies] = await Promise.all([
      listTransactions({
        from,
        to,
        page,
        /* The Transfer chip is one control for two row types: an exchange moved money between two currencies
           and belongs with the transfers, exactly as the mockup's own count does. */
        type: typeFilter === "transfer" ? undefined : typeFilter || undefined,
        typeIn: typeFilter === "transfer" ? ["transfer", "exchange"] : undefined,
        walletId: walletFilter || undefined,
        categoryId: categoryFilter || undefined,
        search: search || undefined,
        perPage: MAX_PER_PAGE,
      }),
      monthSummary(readReportQuery(new URLSearchParams({ month }))),
      /* The chips count the **month**, not the filtered result: a count that moved with the filter would make
         "Expense 35" mean "35 of the rows you can already see", which is not what it says. */
      db.transaction.groupBy({
        by: ["transaction_type"],
        where: {
          deleted_at: null,
          occurred_on: { gte: parseCalendarDate(from, "from"), lte: parseCalendarDate(to, "to") },
        },
        _count: { _all: true },
      }),
      db.wallet.findMany({ where: { deleted_at: null }, select: { id: true, name: true, currency_id: true } }),
      db.category.findMany({
        where: { archived_at: null },
        select: { id: true, name: true, color: true, icon: true },
      }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);
    return { listed, summary, counts, wallets, categories, currencies };
  });

  const countOf = (type: string): number =>
    data.counts.find((row) => row.transaction_type === type)?._count._all ?? 0;
  const allCount = data.counts.reduce((total, row) => total + row._count._all, 0);

  const chips: { value: string; label: string; count: number }[] = [
    { value: "", label: "All", count: allCount },
    { value: "expense", label: "Expense", count: countOf("expense") },
    { value: "income", label: "Income", count: countOf("income") },
    { value: "transfer", label: "Transfer", count: countOf("transfer") + countOf("exchange") },
  ];

  const walletName = new Map(data.wallets.map((wallet) => [wallet.id, wallet.name]));
  const walletCurrency = new Map(data.wallets.map((wallet) => [wallet.id, wallet.currency_id]));
  const categories = new Map(
    data.categories.map((row) => [row.id, { name: row.name, color: row.color, icon: row.icon }]),
  );
  const currencies = new Map(data.currencies.map((currency) => [currency.code, currency]));

  const display = (code: string): CurrencyDisplay => {
    const currency = currencies.get(code);
    return currency
      ? { symbol: currency.symbol, suffix: currency.suffix, minorUnit: currency.minor_unit }
      : { symbol: code, suffix: false, minorUnit: 2 };
  };

  const isListEmpty = data.listed.data.length === 0;

  const noun = typeFilter === "" ? "transactions" : `${typeFilter} rows`;
  const emptySentence =
    page > 1
      ? "That page is past the end of the month. Step back with the pager below."
      : activeFilters
        ? `No ${noun} match this filter. Widen it, or log one and it appears immediately.`
        : `No ${noun} in this month. Log one and it appears immediately.`;

  const pagerQuery: Record<string, string> = { month };
  if (typeFilter) pagerQuery.type = typeFilter;
  if (walletFilter) pagerQuery.wallet = walletFilter;
  if (categoryFilter) pagerQuery.category = categoryFilter;
  if (search) pagerQuery.q = search;

  return (
    <>
      <ShellHeader title="Transactions" action={<TransactionSearch />}>
        <MonthSelector month={month} basePath="/transactions" currentMonth={today.slice(0, 7)} />
      </ShellHeader>

      <div className="flex flex-col gap-8 px-4 pt-4 md:px-6 md:pt-6">
        <SummaryBand
          income={data.summary.income}
          expense={data.summary.expense}
          net={data.summary.net}
          currency={display(data.summary.currency)}
        />

        <form data-slot="transaction-filters" method="get" action="/transactions" className="flex flex-col gap-2">
          <input type="hidden" name="month" value={month} />
          {search ? <input type="hidden" name="q" value={search} /> : null}

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

          {/* The mockup has no wallet or category control, so they stay folded away: reachable, 44px, and out
              of the way of the four chips that are the screen's filter. Opening one makes the panel start open. */}
          <details
            data-slot="transaction-detail-filters"
            className="text-caption"
            open={Boolean(walletFilter || categoryFilter)}
          >
            <summary className="cursor-pointer px-1 text-ash underline underline-offset-4">
              Wallet &amp; category filters
            </summary>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <select
                name="wallet"
                defaultValue={walletFilter}
                aria-label="Wallet"
                className="h-11 rounded-input border border-hairline bg-card px-2 text-small text-ink"
              >
                <option value="">All wallets</option>
                {data.wallets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <select
                name="category"
                defaultValue={categoryFilter}
                aria-label="Category"
                className="h-11 rounded-input border border-hairline bg-card px-2 text-small text-ink"
              >
                <option value="">All categories</option>
                {data.categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-11 rounded-pill bg-ink px-4 text-small text-paper">
                Apply
              </button>
            </div>
          </details>

          {activeFilters ? (
            <Link
              href={`/transactions?month=${month}`}
              className="self-start px-1 text-caption text-ash underline underline-offset-4"
            >
              Clear all filters
            </Link>
          ) : null}
        </form>

        {isListEmpty ? (
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
          />
        )}
      </div>

      <LedgerPager
        page={data.listed.page}
        totalPages={data.listed.totalPages}
        basePath="/transactions"
        query={pagerQuery}
      />
    </>
  );
}

/** The last calendar day of `yyyy-mm`, computed without a clock so the server and the browser agree. */
function lastDayOf(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return String(new Date(Date.UTC(year, index, 0)).getUTCDate()).padStart(2, "0");
}
