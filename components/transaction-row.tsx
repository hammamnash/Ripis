import { ArrowRightLeft, CircleArrowDown, CircleArrowUp } from "lucide-react";
import Link from "next/link";

import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import type { TransactionResponse } from "@/src/server/transactions/serialise";

/*
 * §7 screen 2's row. The response carries ids, not names, so the caller joins them and passes them in — the
 * server module has no business knowing what a wallet is *called*, and the row has no business querying.
 *
 * `exchange` borrows the transfer arrow: money left one wallet and arrived in another, and §5 has no separate
 * mark for it.
 */
const DIRECTION = {
  expense: "expense",
  income: "income",
  transfer: "transfer",
  exchange: "transfer",
} as const;

export function TransactionRow({
  transaction,
  walletName,
  categoryName,
  currency,
}: {
  transaction: TransactionResponse;
  walletName: string;
  categoryName: string | null;
  currency: CurrencyDisplay;
}) {
  const title =
    categoryName ?? (transaction.transactionType === "transfer" ? "Transfer" : transaction.transactionType === "exchange" ? "Exchange" : "Transaction");

  return (
    <Link
      href={`/transactions/${transaction.id}`}
      data-slot="transaction-row"
      className="flex items-center justify-between gap-4 px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span data-slot="transaction-icon" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-insight text-ink">
          {transaction.transactionType === "income" ? <CircleArrowUp aria-hidden className="size-5" /> : transaction.transactionType === "expense" ? <CircleArrowDown aria-hidden className="size-5" /> : <ArrowRightLeft aria-hidden className="size-5" />}
        </span>
        <div className="min-w-0">
        <p className="truncate text-body text-ink">{transaction.description ?? title}</p>
        <p className="mt-0.5 truncate text-caption text-ash">
          {transaction.notes ? `${title} · ${walletName} · ${transaction.notes}` : `${title} · ${walletName}`}
        </p>
        </div>
      </div>
      <Amount
        value={transaction.amount}
        currency={currency}
        direction={DIRECTION[transaction.transactionType]}
        className="shrink-0 text-body"
      />
    </Link>
  );
}
