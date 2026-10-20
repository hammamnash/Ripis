import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ShellHeader } from "@/components/shell/header";
import { TransactionForm } from "@/components/transaction-form";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { getTransaction } from "@/src/server/transactions/read-transactions";
import { editTransactionAction } from "./actions";

/*
 * §7 screen 4 again, in edit mode (FR-06). It loads the row and hands the form its current values; every
 * rule the create path enforces runs again on submit (`updateTransaction` → `prepareTransaction`), so this
 * screen cannot be a way to build a transaction that could not have been created.
 */
export default async function EditTransactionPage({ params }: PageProps<"/transactions/[id]/edit">) {
  await connection();
  const { caller } = await requireScreenSession();
  const { id } = await params;

  const data = await runAsCaller(caller, async () => {
    const transaction = await getTransaction(id);
    if (!transaction) return null;

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

    return { transaction, wallets, categories, currencies };
  });

  if (!data) notFound();

  const symbols = Object.fromEntries(data.currencies.map((row) => [row.code, row.symbol]));

  return (
    <>
      <ShellHeader title="Edit transaction" />
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
        today={data.transaction.occurredOn}
        transactionId={data.transaction.id}
        action={editTransactionAction}
        submitLabel="Save changes"
        initial={{
          transactionType: data.transaction.transactionType === "exchange" ? "transfer" : data.transaction.transactionType,
          amount: trimMoney(data.transaction.amount),
          walletId: data.transaction.walletId,
          destinationWalletId: data.transaction.destinationWalletId,
          destinationAmount: trimMoney(data.transaction.destinationAmount),
          categoryId: data.transaction.categoryId,
          description: data.transaction.description,
        }}
      />
    </>
  );
}

/*
 * `money()` is a 4-dp string because that is what the ledger stores; a field showing `7000.0000` is the
 * stored precision leaking into a text box. Trailing zeros are display noise, and the parse in the action
 * accepts either spelling, so trimming here changes no money.
 */
function trimMoney(value: string | null): string | null {
  if (value === null) return null;
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}
