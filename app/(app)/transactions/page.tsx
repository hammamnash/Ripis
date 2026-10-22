import { Receipt } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/empty-state";
import { MonthSelector } from "@/components/month-selector";
import { SummaryBand } from "@/components/summary-band";
import { TransactionSearch } from "@/components/transaction-search";
import { ShellHeader } from "@/components/shell/header";
import { TransactionRow } from "@/components/transaction-row";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { calendarDate } from "@/src/server/time/calendar-date";
import { listTransactions, MAX_PER_PAGE } from "@/src/server/transactions/read-transactions";
import { readReportQuery } from "@/src/server/reports/filter";
import { monthSummary } from "@/src/server/reports/month-summary";
import type { TransactionResponse } from "@/src/server/transactions/serialise";

/*
 * Screen 2 (§7). The month lives in `?month=yyyy-mm` rather than in component state, so the current view is a
 * URL: a reload reproduces it, the back button steps through it, and the e2e suite can assert a month change
 * without typing. An unparseable value falls back to the current month instead of throwing — a hand-edited
 * query string is not a server error, and `calendarDate` is the app's one notion of "today" (UTC, ADR-0007).
 *
 * The rows arrive with ids and no names, so this screen joins them. That join is the page's job: the list
 * module knows nothing about what a wallet is called, and the row knows nothing about the database.
 */
export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  /* Request data, twice over: `searchParams` and the fallback month, which is whatever month it is now. Next
     still attempted a prerender pass here and logged `unstable value new Date()` for every navigation to this
     screen — the frame declares `connection()` for itself, and a page has to say it for its own reads. */
  await connection();

  const { caller } = await requireScreenSession();
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : undefined;
  const month =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : calendarDate(new Date()).slice(0, 7);

  /* A page number is a hand-editable query string, so it is clamped here rather than trusted: the list module
     would happily ask Postgres for skip = -1. */
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const pick = (key: string): string => (typeof params[key] === "string" ? String(params[key]) : "");
  const filters = { type: pick("type"), wallet: pick("wallet"), category: pick("category") };
  const search = typeof params.q === "string" ? params.q : "";
  const activeFilters = Boolean(filters.type || filters.wallet || filters.category || search);

  const data = await runAsCaller(caller, async () => {
    const [listed, summary, wallets, categories, currencies] = await Promise.all([
      listTransactions({
        from: `${month}-01`,
        to: `${month}-${lastDayOf(month)}`,
        page,
        type: filters.type || undefined,
        walletId: filters.wallet || undefined,
        categoryId: filters.category || undefined,
        search: search || undefined,
        perPage: MAX_PER_PAGE,
      }),
      monthSummary(readReportQuery(new URLSearchParams({ month }))),
      db.wallet.findMany({ where: { deleted_at: null }, select: { id: true, name: true } }),
      db.category.findMany({ where: { archived_at: null }, select: { id: true, name: true } }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);
    return { listed, wallets, categories, currencies, summary };
  });

  const walletName = new Map(data.wallets.map((wallet) => [wallet.id, wallet.name]));
  const categoryName = new Map(data.categories.map((category) => [category.id, category.name]));
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

  return (
    <>
      <ShellHeader title="Transactions">
        <MonthSelector month={month} basePath="/transactions" />
      </ShellHeader>

      <SummaryBand income={data.summary.income} expense={data.summary.expense} net={data.summary.net} currency={display(data.summary.currency)} />

      <form data-slot="transaction-filters" method="get" action="/transactions" className="flex flex-wrap items-center gap-2 px-4 pb-4">
        <input type="hidden" name="month" value={month} />
        <TransactionSearch />
        <select name="type" defaultValue={filters.type} aria-label="Type" className="h-9 rounded-[10px] border border-hairline bg-card px-2 text-caption text-ink">
          <option value="">All types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
        <select name="wallet" defaultValue={filters.wallet} aria-label="Wallet" className="h-9 rounded-[10px] border border-hairline bg-card px-2 text-caption text-ink">
          <option value="">All wallets</option>
          {data.wallets.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <select name="category" defaultValue={filters.category} aria-label="Category" className="h-9 rounded-[10px] border border-hairline bg-card px-2 text-caption text-ink">
          <option value="">All categories</option>
          {data.categories.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-[10px] bg-ink px-3 text-caption text-paper">Apply</button>
        {activeFilters ? (
          <Link href={`/transactions?month=${month}`} className="text-caption text-ash underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {days.length === 0 ? (
        <div className="px-4 py-10">
          <EmptyState
            icon={Receipt}
            title={page > 1 ? "Nothing on this page" : "No transactions in this month"}
          >
            {page > 1
              ? "That page is past the end of the month. Step back with the pager below."
              : "Log an expense with the + button and it lands here, filed under the day it happened."}
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-6 px-4 py-6">
          {days.map((day) => (
            <section key={day.on} data-slot="transaction-day" className="flex flex-col">
              <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2">
                <h2 className="text-caption text-ash">{dayLabel(day.on)}</h2>
                <Amount
                  value={sumSigned(day.rows)}
                  currency={display(day.rows[0]?.baseCurrencyId ?? "IDR")}
                  className="text-caption text-ash"
                />
              </div>
              <div className="flex flex-col divide-y divide-hairline">
                {day.rows.map((row) => (
                  <TransactionRow
                    key={row.id}
                    transaction={row}
                    walletName={walletName.get(row.walletId) ?? "Wallet"}
                    categoryName={row.categoryId === null ? null : (categoryName.get(row.categoryId) ?? null)}
                    currency={display(row.currencyId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {data.listed.totalPages > 1 ? (
        <nav data-slot="transaction-pager" className="flex items-center justify-between gap-3 px-4 pb-10 pt-2">
          <PagerLink month={month} page={data.listed.page - 1} disabled={data.listed.page <= 1}>
            Newer
          </PagerLink>
          <p className="text-caption text-ash">
            Page {data.listed.page} of {data.listed.totalPages}
          </p>
          <PagerLink
            month={month}
            page={data.listed.page + 1}
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
  month,
  page,
  disabled,
  children,
}: {
  month: string;
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return <span aria-disabled="true" className="text-caption text-ash">{children}</span>;
  }
  return (
    <Link
      href={`/transactions?month=${month}&page=${page}`}
      className="text-caption text-ink underline underline-offset-4"
    >
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
