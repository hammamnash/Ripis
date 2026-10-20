import { Receipt } from "lucide-react";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/empty-state";
import { MonthSelector } from "@/components/month-selector";
import { ShellHeader } from "@/components/shell/header";
import { TransactionRow } from "@/components/transaction-row";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { calendarDate } from "@/src/server/time/calendar-date";
import { listTransactions, MAX_PER_PAGE } from "@/src/server/transactions/read-transactions";
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

  const data = await runAsCaller(caller, async () => {
    const [page, wallets, categories, currencies] = await Promise.all([
      listTransactions({
        from: `${month}-01`,
        to: `${month}-${lastDayOf(month)}`,
        perPage: MAX_PER_PAGE,
      }),
      db.wallet.findMany({ select: { id: true, name: true } }),
      db.category.findMany({ select: { id: true, name: true } }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);
    return { page, wallets, categories, currencies };
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
  for (const row of data.page.data) {
    const last = days[days.length - 1];
    if (last && last.on === row.occurredOn) last.rows.push(row);
    else days.push({ on: row.occurredOn, rows: [row] });
  }

  return (
    <>
      <ShellHeader title="Transactions">
        <MonthSelector month={month} basePath="/transactions" />
      </ShellHeader>

      {days.length === 0 ? (
        <div className="px-4 py-10">
          <EmptyState icon={Receipt} title="No transactions in this month">
            Log an expense with the + button and it lands here, filed under the day it happened.
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
    </>
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
