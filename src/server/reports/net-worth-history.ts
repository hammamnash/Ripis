import { Prisma } from "@prisma/client";

import { primaryCurrency } from "../currency";
import { db } from "../db";
import { money } from "../money/amount";
import { value } from "../money/direction";
import { firstOfMonth } from "../time/calendar-date";

export interface NetWorthHistoryPoint {
  month: string;
  assets: string;
  liabilities: string;
  netWorth: string;
  currency: string;
}

/** Capture the caller's current stored wallet balances for one calendar month. */
export async function captureCurrentNetWorth(month: Date = firstOfMonth(new Date())): Promise<void> {
  const currency = await primaryCurrency();
  const wallets = await db.wallet.findMany({ where: { deleted_at: null } });

  await db.$transaction(
    wallets.map((wallet) => {
      const balance = new Prisma.Decimal(wallet.current_balance);
      const signed = value(wallet, wallet.current_balance);
      return db.balanceSnapshot.upsert({
        where: { user_id_wallet_id_month: { user_id: wallet.user_id, wallet_id: wallet.id, month } },
        create: {
          user_id: wallet.user_id,
          wallet_id: wallet.id,
          month,
          currency_id: wallet.currency_id,
          balance,
          value: signed,
          is_liability: wallet.is_liability,
        },
        update: { balance, value: signed, is_liability: wallet.is_liability, currency_id: wallet.currency_id },
      });
    }),
  );

  void currency;
}

/** Read captured history in the primary currency; absent months remain absent rather than fabricated. */
export async function netWorthHistory(from: Date, to: Date): Promise<NetWorthHistoryPoint[]> {
  const currency = await primaryCurrency();
  const rows = await db.balanceSnapshot.groupBy({
    by: ["month", "is_liability"],
    where: { currency_id: currency, month: { gte: from, lt: to } },
    _sum: { value: true },
    orderBy: { month: "asc" },
  });
  const months = new Map<string, { assets: Prisma.Decimal; liabilities: Prisma.Decimal }>();
  for (const row of rows) {
    const key = row.month.toISOString().slice(0, 10);
    const current = months.get(key) ?? { assets: new Prisma.Decimal(0), liabilities: new Prisma.Decimal(0) };
    const total = row._sum.value ?? new Prisma.Decimal(0);
    if (row.is_liability) current.liabilities = current.liabilities.plus(total.abs());
    else current.assets = current.assets.plus(total);
    months.set(key, current);
  }
  return [...months.entries()].map(([month, totals]) => ({ month, assets: money(totals.assets), liabilities: money(totals.liabilities), netWorth: money(totals.assets.minus(totals.liabilities)), currency }));
}
