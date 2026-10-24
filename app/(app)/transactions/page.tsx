import { List } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/empty-state";
import { MonthSelector, monthLabel } from "@/components/month-selector";
import { SummaryBand } from "@/components/summary-band";
import { TransactionSearch } from "@/components/transaction-search";
import { ShellHeader } from "@/components/shell/header";
import { TransactionRow } from "@/components/transaction-row";
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
import type { TransactionResponse } from "@/src/server/transactions/serialise";

/*
 * Screen 2 (§7), composed from mockup 001: month selector, the inverted summary band, a filter chip row with
 * counts, then hairline-separated rows.
 *
 * The month lives in `?month=yyyy-mm` rather than in component state, so the current view is a URL: a reload
 * reproduces it, the back button steps through it, and the e2e suite can assert a month change without typing.
 * An unparseable value falls back to the current month instead of throwing — a hand-edited query string is not
 * a server error, and `calendarDate` is the app's one notion of "today" (UTC, ADR-0007). The type filter is a
 * URL for the same reason, which is why the chip row is a `method="get"` form of submit buttons and not a
 * client-side filter: the same HTML works before hydration and the browser's back button steps through filters.
 *
 * The rows arrive with ids and no names, so this screen joins them. That join is the page's job: the list
 * module knows nothing about what a wallet is called, and the row knows nothing about the database.
 *
 * **Days are kept.** The mockup draws one flat list of 45 rows because it has no day grouping; this screen
 * groups by `occurred_on` and labels each group with the day and its net, so the date is dropped from every
 * row's meta line instead of repeating it 45 times.
 */
/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

/** The chip row's fixed vocabulary. `transfer` covers `exchange` too — see the `typeIn` note below. */
const TYPE_CHIPS = ["expense", "income", "transfer"] as const;

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  /* Request data, twice over: `searchParams` and the fallback month, which is whatever month it is now. Next
     still attempted a prerender pass here and logged `unstable value new Date()` for every navigation to this
     screen — the frame declares `connection()` for itself, and a page has to say it for its own reads. */
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

  const days: { on: string; rows: TransactionResponse[] }[] = [];
  for (const row of data.listed.data) {
    const last = days[days.length - 1];
    if (last && last.on === row.occurredOn) last.rows.push(row);
    else days.push({ on: row.occurredOn, rows: [row] });
  }

  const noun = typeFilter === "" ? "transactions" : `${typeFilter} rows`;
  const emptySentence =
    page > 1
      ? "That page is past the end of the month. Step back with the pager below."
      : activeFilters
        ? `No ${noun} match this filter. Widen it, or log one and it appears immediately.`
        : `No ${noun} in this month. Log one and it appears immediately.`;

  const pageHref = (target: number): string => {
    const query = new URLSearchParams({ month, page: String(target) });
    if (typeFilter) query.set("type", typeFilter);
    if (walletFilter) query.set("wallet", walletFilter);
    if (categoryFilter) query.set("category", categoryFilter);
    if (search) query.set("q", search);
    return `/transactions?${query.toString()}`;
  };

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

        {days.length === 0 ? (
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
          <div data-slot="transaction-list" className="flex flex-col gap-6">
            {days.map((day) => (
              <section key={day.on} data-slot="transaction-day" className="flex flex-col">
                <div className="flex items-baseline justify-between gap-2 pb-1">
                  <h2 className="text-micro uppercase tracking-micro text-ash">{dayLabel(day.on)}</h2>
                  {/* A day of nothing but transfers has no income and no expense, so its net is a true zero and
                      a "Rp 0" label beside three rows would read as a bug rather than as an answer. */}
                  {day.rows.some((row) => row.transactionType === "income" || row.transactionType === "expense") ? (
                    <Amount
                      value={sumSigned(day.rows)}
                      currency={display(day.rows[0]?.baseCurrencyId ?? "IDR")}
                      tone="ash"
                      className="text-caption"
                    />
                  ) : null}
                </div>
                {day.rows.map((row) => {
                  /* An exchange's received leg is stored in the *destination wallet's* currency, which the row
                     does not carry — the wallet does. A missing wallet falls back to the row's own currency
                     rather than to the base one, so the figure is never silently relabelled. */
                  const destination =
                    row.transactionType === "exchange" &&
                    row.destinationAmount !== null &&
                    row.destinationWalletId !== null
                      ? {
                          amount: row.destinationAmount,
                          currency: display(walletCurrency.get(row.destinationWalletId) ?? row.currencyId),
                        }
                      : null;

                  return (
                    <TransactionRow
                      key={row.id}
                      transaction={row}
                      walletName={walletName.get(row.walletId) ?? "Wallet"}
                      destinationWalletName={
                        row.destinationWalletId === null
                          ? null
                          : (walletName.get(row.destinationWalletId) ?? null)
                      }
                      category={row.categoryId === null ? null : (categories.get(row.categoryId) ?? null)}
                      currency={display(row.currencyId)}
                      destination={destination}
                    />
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>

      {data.listed.totalPages > 1 ? (
        <nav data-slot="transaction-pager" className="flex items-center justify-between gap-3 px-4 pb-10 pt-2 md:px-6 md:pb-12">
          <PagerLink href={pageHref(data.listed.page - 1)} disabled={data.listed.page <= 1}>
            Newer
          </PagerLink>
          <p className="text-caption text-ash">
            Page {data.listed.page} of {data.listed.totalPages}
          </p>
          <PagerLink
            href={pageHref(data.listed.page + 1)}
            disabled={data.listed.page >= data.listed.totalPages}
          >
            Older
          </PagerLink>
        </nav>
      ) : null}
    </>
  );
}

/** A disabled step is a span, not a link: an href onto the page you are already reading is a control that lies. */
function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return <span aria-disabled="true" className="text-caption text-ash">{children}</span>;
  }
  return (
    <Link href={href} className="text-caption text-ink underline underline-offset-4">
      {children}
    </Link>
  );
}

/** The last calendar day of `yyyy-mm`, computed without a clock so the server and the browser agree. */
function lastDayOf(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return String(new Date(Date.UTC(year, index, 0)).getUTCDate()).padStart(2, "0");
}

/** `Tue 14 Oct`, in UTC because `occurredOn` is a date and not an instant (ADR-0007). */
function dayLabel(occurredOn: string): string {
  return new Date(`${occurredOn}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const SCALE = 4;

/** A decimal string as an integer number of 1e-4 units. Money is never a float, not even for a day total. */
function toScaled(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^[-+]/, "").split(".");
  const digits = `${whole}${(fraction + "0".repeat(SCALE)).slice(0, SCALE)}`.replace(/^0+(?=\d)/, "") || "0";
  const scaled = BigInt(digits);
  return negative ? -scaled : scaled;
}

function fromScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const text = (negative ? -scaled : scaled).toString().padStart(SCALE + 1, "0");
  return `${negative ? "-" : ""}${text.slice(0, -SCALE)}.${text.slice(-SCALE)}`;
}

/**
 * The day's net, in the base currency: income minus expense. A transfer or an exchange moves money between
 * wallets without changing what the day cost, so it contributes nothing.
 */
function sumSigned(rows: TransactionResponse[]): string {
  let total = 0n;
  for (const row of rows) {
    if (row.transactionType === "income") total += toScaled(row.baseAmount);
    else if (row.transactionType === "expense") total -= toScaled(row.baseAmount);
  }
  return fromScaled(total);
}
