import Link from "next/link";

import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import type { WalletResponse } from "@/src/server/wallets/serialise";

/*
 * §5 "Wallet Card": the name, its type, and the balance set right in tabular figures.
 *
 * A liability shows what is owed as a positive number with the word beside it — never a minus sign
 * (ADR-0025): the statement says 2.000.000, so the card says 2.000.000, and the word carries the direction.
 */
const TYPE_LABELS: Record<WalletResponse["walletType"], string> = {
  cash: "Cash",
  debit_account: "Debit",
  savings_account: "Savings",
  checking_account: "Checking",
  prepaid_card: "Prepaid",
  e_wallet: "E-wallet",
  credit_card: "Credit card",
  loan: "Loan",
  debt: "Debt",
  investment_account: "Investment",
  other: "Other",
};

export function WalletCard({ wallet, currency }: { wallet: WalletResponse; currency: CurrencyDisplay }) {
  const owed = wallet.isLiability;

  return (
    <Link
      href={`/wallets/${wallet.id}`}
      data-slot="wallet-card"
      className="flex items-center justify-between gap-4 rounded-[16px] border border-hairline bg-card p-5"
    >
      <div className="min-w-0">
        <p className="truncate text-body text-ink">{wallet.name}</p>
        <p className="mt-1 text-caption text-ash">
          {TYPE_LABELS[wallet.walletType]}
          {owed ? " · Liability" : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Amount
          value={wallet.currentBalance}
          currency={currency}
          className={owed ? "text-subheading text-negative" : "text-subheading text-ink"}
        />
        {owed ? <p className="mt-1 text-micro uppercase text-ash">Owed</p> : null}
      </div>
    </Link>
  );
}
