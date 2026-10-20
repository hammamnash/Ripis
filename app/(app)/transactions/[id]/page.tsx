import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { ShellHeader } from "@/components/shell/header";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { getTransaction } from "@/src/server/transactions/read-transactions";

export default async function TransactionDetailPage({ params }: PageProps<"/transactions/[id]">) {
  await connection();
  const { caller } = await requireScreenSession();
  const { id } = await params;

  const data = await runAsCaller(caller, async () => {
    const transaction = await getTransaction(id);
    if (!transaction) return null;
    const [wallet, destination, category, currencies] = await Promise.all([
      db.wallet.findUnique({ where: { id: transaction.walletId }, select: { name: true } }),
      transaction.destinationWalletId
        ? db.wallet.findUnique({ where: { id: transaction.destinationWalletId }, select: { name: true } })
        : Promise.resolve(null),
      transaction.categoryId
        ? db.category.findUnique({ where: { id: transaction.categoryId }, select: { name: true } })
        : Promise.resolve(null),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);
    return { transaction, walletName: wallet?.name ?? null, destinationName: destination?.name ?? null, categoryName: category?.name ?? null, currencies };
  });

  if (!data) notFound();

  const display = (code: string): CurrencyDisplay => {
    const row = data.currencies.find((currency) => currency.code === code);
    return row ? { symbol: row.symbol, suffix: row.suffix, minorUnit: row.minor_unit } : { symbol: code, suffix: false, minorUnit: 2 };
  };
  const { transaction } = data;

  return (
    <>
      <ShellHeader title="Transaction" />
      <section data-slot="transaction-detail" className="flex flex-col gap-6 rounded-[16px] border border-hairline bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="text-caption text-ash">{transaction.transactionType}</p>
          <Amount
            value={transaction.amount}
            currency={display(transaction.currencyId)}
            direction={transaction.transactionType === "income" ? "income" : transaction.transactionType === "expense" ? "expense" : "transfer"}
            className="text-subheading text-ink"
          />
          <p className="text-caption text-ash">{transaction.occurredOn}</p>
        </div>
        <dl className="flex flex-col gap-3 text-body">
          <div className="flex justify-between gap-4"><dt className="text-ash">Wallet</dt><dd className="text-ink">{data.walletName ?? "—"}</dd></div>
          {data.destinationName ? <div className="flex justify-between gap-4"><dt className="text-ash">To</dt><dd className="text-ink">{data.destinationName}</dd></div> : null}
          <div className="flex justify-between gap-4"><dt className="text-ash">Category</dt><dd className="text-ink">{data.categoryName ?? "—"}</dd></div>
          {transaction.description ? <div className="flex justify-between gap-4"><dt className="text-ash">Description</dt><dd className="text-right text-ink">{transaction.description}</dd></div> : null}
        </dl>
        <p className="text-caption text-ash">
          Recorded in the base currency as{" "}
          <Amount value={transaction.baseAmount} currency={display(transaction.baseCurrencyId)} className="text-caption text-ink" />
        </p>
      </section>
    </>
  );
}
