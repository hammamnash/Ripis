import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Amount } from "@/components/amount";
import { ReconcileForm } from "@/components/reconcile-form";
import { ShellHeader } from "@/components/shell/header";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { db } from "@/src/server/db";
import { calendarDate } from "@/src/server/time/calendar-date";
import { getWallet } from "@/src/server/wallets/list-wallets";

const LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank Account",
  e_wallet: "E-Wallet",
  credit_card: "Credit Card",
  investment: "Investment Account",
  other: "Other",
};

export default async function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { caller } = await requireScreenSession();
  const { id } = await params;

  const data = await runAsCaller(caller, async () => {
    /* A balance is the wallet module's to state, not a column a screen may read; the invariant suite
       pins that column to the server layer, and this page is why the pin exists. */
    const wallet = await getWallet(id);
    if (!wallet) return null;

    const [rows, categories, currencies] = await Promise.all([
      db.transaction.findMany({
        where: { wallet_id: id, deleted_at: null },
        orderBy: [{ occurred_on: "desc" }],
        take: 20,
        select: {
          id: true,
          transaction_type: true,
          occurred_on: true,
          amount: true,
          currency_id: true,
          description: true,
          category_id: true,
        },
      }),
      db.category.findMany({ where: { archived_at: null }, select: { id: true, name: true, type: true } }),
      db.currency.findMany({ select: { code: true, symbol: true, suffix: true, minor_unit: true } }),
    ]);

    return { wallet, rows, categories, currencies };
  });

  if (!data) notFound();

  const display = (code: string): CurrencyDisplay => {
    const row = data.currencies.find((entry) => entry.code === code);
    return row
      ? { symbol: row.symbol, suffix: row.suffix, minorUnit: row.minor_unit }
      : { symbol: code, suffix: false, minorUnit: 2 };
  };

  const { wallet } = data;
  const categoryName = (categoryId: string | null) =>
    categoryId ? (data.categories.find((entry) => entry.id === categoryId)?.name ?? null) : null;

  return (
    <>
      <ShellHeader title={wallet.name} />

      <div className="flex flex-col gap-6 px-4 pb-10 pt-2">
        <section
          data-slot="wallet-headline"
          className="flex flex-col gap-1 rounded-[16px] border border-hairline bg-card px-4 py-4"
        >
          <p className="text-caption text-ash">
            {LABELS[wallet.walletType] ?? wallet.walletType}
            {wallet.isLiability ? " · owed" : ""}
          </p>
          <Amount
            value={wallet.currentBalance}
            currency={display(wallet.currencyId)}
            className="text-subheading text-ink"
          />
        </section>

        {/* §7 screen 8 composed into screen 7, which lists "reconciliation" as part of it. The form
            takes the figure getWallet already projected — never the stored column — so the screen
            reconciles against the same number it shows. */}
        <ReconcileForm
          walletId={wallet.id}
          walletName={wallet.name}
          isLiability={wallet.isLiability}
          recordedBalance={wallet.currentBalance}
          currency={display(wallet.currencyId)}
          categories={data.categories}
          today={calendarDate(new Date())}
        />

        <section data-slot="wallet-ledger" className="flex flex-col gap-2">
          <h2 className="text-caption uppercase text-ash">Last 20 entries</h2>

          {data.rows.length === 0 ? (
            <p className="text-body text-ash">
              Nothing has touched this wallet yet.
            </p>
          ) : (
            data.rows.map((row) => (
              <div
                key={row.id}
                data-slot="wallet-ledger-row"
                className="flex items-baseline justify-between gap-3 border-b border-hairline py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-body text-ink">
                    {row.description ?? categoryName(row.category_id) ?? row.transaction_type}
                  </p>
                  <p className="text-caption text-ash">{row.occurred_on.toISOString().slice(0, 10)}</p>
                </div>
                <Amount
                  value={row.amount.toString()}
                  currency={display(row.currency_id)}
                  direction={row.transaction_type === "income" ? "income" : row.transaction_type === "expense" ? "expense" : "none"}
                  className="shrink-0 text-body"
                />
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
