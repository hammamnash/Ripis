import { EmptyState } from "@/components/empty-state";
import { ShellHeader } from "@/components/shell/header";
import { Button } from "@/components/ui/button";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

/* Screen 1 (§7). A placeholder for the geometry suite: the Net Worth Hero, wallet cards, budget
   bars and the one Insight Card arrive with the data layer in Task 7.4. The empty state is not a
   throwaway — §5 wants exactly this when a ledger has nothing in it, and the copy states the next
   step rather than the absence. */
export default function DashboardPage() {
  return (
    <>
      <ShellHeader title="Dashboard" />

      <div className="px-4 py-10">
        <EmptyState
          icon={LayoutDashboard}
          title="Nothing to show yet"
          action={
            <Button asChild>
              <Link href="/wallets">Set up a wallet</Link>
            </Button>
          }
        >
          Add a wallet and log your first transaction — the monthly picture builds itself from there.
        </EmptyState>
      </div>
    </>
  );
}
