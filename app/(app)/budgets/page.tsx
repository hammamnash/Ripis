import { EmptyState } from "@/components/empty-state";
import { ShellHeader } from "@/components/shell/header";
import { ChartPie } from "lucide-react";

/* Screen 9 (§7). Budget Bars and the month scope arrive in Task 7.4e. */
export default function BudgetsPage() {
  return (
    <>
      <ShellHeader title="Budgets" />

      <div className="px-4 py-10">
        <EmptyState icon={ChartPie} title="No budgets yet">
          Set a monthly limit per category to see how the month is tracking before it is over.
        </EmptyState>
      </div>
    </>
  );
}
