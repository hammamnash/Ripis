"use server";

import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { listTransactions } from "@/src/server/transactions/read-transactions";

export interface RangeSummary {
  count: number | null;
  error: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/*
 * Screen 12 (§7, Task 7.4f) asks for "a summary of what will be included" before a file is produced.
 * The count is the figure the export itself will select, because it is read through
 * `listTransactions` — the module that owns the range filter. A screen that wrote its own `where`
 * clause would be a second definition of "in range", and the two would drift (ADR-0039).
 */
export async function exportSummaryAction(input: { from: string; to: string }): Promise<RangeSummary> {
  const { caller } = await requireScreenSession();

  if (!DATE.test(input.from) || !DATE.test(input.to)) {
    return { count: null, error: "Both dates must be written YYYY-MM-DD." };
  }

  try {
    const page = await runAsCaller(caller, () =>
      listTransactions({ from: input.from, to: input.to, perPage: 1 }),
    );
    return { count: page.total, error: null };
  } catch (error) {
    /* A real calendar date a person can type into an input — 2026-02-30 — reaches `parseCalendarDate`
       and is refused in a sentence; that sentence is more actionable than a generic failure. */
    return { count: null, error: error instanceof Error ? error.message : "The range could not be read." };
  }
}
