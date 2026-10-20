import { EmptyState } from "@/components/empty-state";
import { ShellHeader } from "@/components/shell/header";
import { Wallet } from "lucide-react";

/* Screen 6 (§7). Wallet Cards grouped by type arrive in Task 7.4d — with the reconciliation screen
   that gives each card its second action. */
export default function WalletsPage() {
  return (
    <>
      <ShellHeader title="Wallets" />

      <div className="px-4 py-10">
        <EmptyState icon={Wallet} title="No wallets yet">
          Add a wallet to start tracking — a bank account, a card, or the cash in your pocket.
        </EmptyState>
      </div>
    </>
  );
}
