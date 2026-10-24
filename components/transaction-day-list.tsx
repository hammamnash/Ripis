import { Amount } from "@/components/amount";
import { TransactionRow, type TransactionRowCategory } from "@/components/transaction-row";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import type { TransactionResponse } from "@/src/server/transactions/serialise";

/*
 * A ledger as days, shared by the transactions list (§7 screen 2) and a wallet's own ledger (§7 screen 7).
 *
 * **Days are kept.** The mockup draws one flat list of 45 rows because it has no day grouping; both screens
 * group by `occurred_on` and label each group with the day and its net, so the date is dropped from every
 * row's meta line instead of repeating it 45 times.
 *
 * The rows arrive with ids and no names, so the caller joins them and passes the maps in: the list module
 * knows nothing about what a wallet is called, and the row queries nothing.
 *
 * `walletInMeta` is what a wallet-scoped screen turns off. The transactions list is about every wallet, so
 * each row names the one it touched; a wallet's own ledger answered that question once, in the title, and
 * repeating it on every row is the same fact forty times. A transfer is the exception either way: its two
 * wallets joined by an arrow are what that line is for.
 */
export interface TransactionDay {
  on: string;
  rows: TransactionResponse[];
}

export function TransactionDayList({
  rows,
  walletName,
  walletCurrency,
  categories,
  display,
  walletInMeta = true,
}: {
  rows: TransactionResponse[];
  walletName: Map<string, string>;
  /** A row's currency is its own; an exchange's received leg is stored in the **destination wallet's**, which
   *  the row does not carry. */
  walletCurrency: Map<string, string>;
  categories: Map<string, TransactionRowCategory>;
  display: (code: string) => CurrencyDisplay;
  walletInMeta?: boolean;
}) {
  return (
    <div data-slot="transaction-list" className="flex flex-col gap-6">
      {groupByDay(rows).map((day) => (
        <section key={day.on} data-slot="transaction-day" className="flex flex-col">
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <h2 className="text-micro uppercase tracking-micro text-ash">{dayLabel(day.on)}</h2>
            {/* A day of nothing but transfers has no income and no expense, so its net is a true zero and a
                "Rp 0" label beside three rows would read as a bug rather than as an answer. */}
            {day.rows.some((row) => row.transactionType === "income" || row.transactionType === "expense") ? (
              <Amount
                value={dayNet(day.rows)}
                currency={display(day.rows[0]?.baseCurrencyId ?? "IDR")}
                tone="ash"
                className="text-caption"
              />
            ) : null}
          </div>

          {day.rows.map((row) => {
            /* An exchange's received leg is stored in the *destination wallet's* currency, which the row does
               not carry — the wallet does. A missing wallet falls back to the row's own currency rather than
               to the base one, so the figure is never silently relabelled. */
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
                  row.destinationWalletId === null ? null : (walletName.get(row.destinationWalletId) ?? null)
                }
                category={row.categoryId === null ? null : (categories.get(row.categoryId) ?? null)}
                currency={display(row.currencyId)}
                destination={destination}
                walletInMeta={walletInMeta}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Rows are already ordered `occurred_on desc, recorded_at desc`, so a day is a run, never a re-sort. */
function groupByDay(rows: TransactionResponse[]): TransactionDay[] {
  const days: TransactionDay[] = [];

  for (const row of rows) {
    const last = days[days.length - 1];
    if (last && last.on === row.occurredOn) last.rows.push(row);
    else days.push({ on: row.occurredOn, rows: [row] });
  }

  return days;
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
function dayNet(rows: TransactionResponse[]): string {
  let total = 0n;
  for (const row of rows) {
    if (row.transactionType === "income") total += toScaled(row.baseAmount);
    else if (row.transactionType === "expense") total -= toScaled(row.baseAmount);
  }
  return fromScaled(total);
}
