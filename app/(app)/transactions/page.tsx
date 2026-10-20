import { EmptyState } from "@/components/empty-state";
import { MonthSelector } from "@/components/month-selector";
import { ShellHeader } from "@/components/shell/header";
import { calendarDate } from "@/src/server/time/calendar-date";
import { Receipt } from "lucide-react";
import { connection } from "next/server";

/*
 * Screen 2 (§7). The list, filters and search arrive in Task 7.4b; what lands now is the month
 * scope that screen is meaningless without.
 *
 * The month lives in `?month=yyyy-mm` rather than in component state, so the current view is a URL:
 * a reload reproduces it, the back button steps through it, and the e2e suite can assert a month
 * change without typing. An unparseable value falls back to the current month instead of throwing —
 * a hand-edited query string is not a server error, and `calendarDate` is the app's one notion of
 * "today" (UTC, ADR-0007).
 */
export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  /* Request data, twice over: `searchParams` and the fallback month, which is whatever month it is now. Next
     still attempted a prerender pass here and logged `unstable value new Date()` for every navigation to this
     screen — the frame declares `connection()` for itself, and a page has to say it for its own reads. */
  await connection();

  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : undefined;
  const month =
    requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : calendarDate(new Date()).slice(0, 7);

  return (
    <>
      <ShellHeader title="Transactions">
        <MonthSelector month={month} basePath="/transactions" />
      </ShellHeader>

      <div className="px-4 py-10">
        <EmptyState icon={Receipt} title="No transactions in this month">
          Log an expense with the + button and it lands here, filed under the day it happened.
        </EmptyState>
      </div>
    </>
  );
}
