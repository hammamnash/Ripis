import { connection } from "next/server";

import { ShellHeader } from "@/components/shell/header";
import { TransactionForm } from "@/components/transaction-form";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { calendarDate } from "@/src/server/time/calendar-date";

/*
 * §7 screen 4, the route the FAB has been pointing at since the shell shipped. It reads wallets and
 * categories for the pickers and nothing else: the form holds no money in state, and every figure it posts
 * is a string the server parses once.
 */
/* Per segment, like the `connection()` call it accompanies: the frame's opt-out does not reach this file. */
export const instant = false;

export default async function NewTransactionPage() {
  await connection();
  const { caller } = await requireScreenSession();

  const data = await runAsCaller(caller, async () => {
    const [wallets, categories, currencies] = await Promise.all([
      db.wallet.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true, currency_id: true, is_liability: true },
        orderBy: { name: "asc" },
      }),
      db.category.findMany({
        where: { archived_at: null },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      }),
      db.currency.findMany({ select: { code: true, symbol: true } }),
    ]);

    return { wallets, categories, currencies };
  });

  const symbols = Object.fromEntries(data.currencies.map((row) => [row.code, row.symbol]));

  return (
    <>
      <ShellHeader title="Add transaction" />
      <TransactionForm
        wallets={data.wallets.map((wallet) => ({
          id: wallet.id,
          name: wallet.name,
          currencyCode: wallet.currency_id,
          isLiability: wallet.is_liability,
        }))}
        categories={data.categories.map((category) => ({
          id: category.id,
          name: category.name,
          type: category.type,
        }))}
        symbols={symbols}
        today={calendarDate(new Date())}
      />
    </>
  );
}
