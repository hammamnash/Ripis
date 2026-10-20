import {
  formatAmountWithDirection,
  formatDate,
  type CurrencyMeta,
  type Direction,
} from "@ripis/money";
import { cn } from "cn";
import { Receipt, type LucideIcon } from "lucide-react";
import Link from "next/link";

/*
 * §5 "Transaction Row" — the most-used component in the app, and the one with no card, no radius
 * and no shadow. Every number below is quoted from §5:
 *
 *   height   64px minimum, 1px hairline bottom, full-bleed to the gutter
 *   layout   [icon 36px] [note 17px/400 ink, truncated] [amount 17px/450 tabular, right]
 *   meta     [category · wallet · date, 12px, ash] — the **date**, never a time
 *   amount   income `+` in --color-positive, expense unprefixed in ink, transfer in ash with `→`
 *
 * Three traps this file exists to not fall into:
 *
 * 1. `occurred_on`, never `recorded_at`. §5: a row that renders a time is reading a field it must
 *    not — `recorded_at` is audit metadata (ADR-0007). So the only date prop is a `yyyy-mm-dd`
 *    calendar string, and it goes through the one formatter as `dd/mm/yyyy`.
 * 2. No `Number()`. `amount` is the string the API sent, and `formatAmountWithDirection` rounds it
 *    once at the currency's minor_unit (ADR-0003). Converting here would turn 1.250.000 into
 *    1.25 — the exact defect §5's grouping rule is about.
 * 3. The sign is composed here, from `direction`, and never stored. An amount has no direction
 *    until the screen says what the row means.
 *
 * Interactive behaviour (swipe to Edit/Delete, long-press context menu) belongs to the Transactions
 * screen, not to the row: §5 describes them, but they need the list's state and the sheet machinery.
 * `href` is the one thing the row can do on its own, so that is all it accepts.
 */
export function TransactionRow({
  note,
  category,
  wallet,
  occurredOn,
  amount,
  currency,
  direction,
  href,
  icon: Icon = Receipt,
  className,
}: {
  note: string;
  category: string;
  wallet: string;
  /** `yyyy-mm-dd` — `occurred_on`, a calendar date. */
  occurredOn: string;
  /** The amount as the API serialises it: a decimal string, never a number. */
  amount: string;
  currency: CurrencyMeta;
  direction: Direction;
  href?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const amountClass =
    direction === "income"
      ? "text-positive"
      : direction === "transfer"
        ? "text-ash"
        : "text-ink";

  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-secondary">
        <Icon aria-hidden className="size-5 text-ink" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-lg leading-body-lg text-ink">{note}</span>
        <span className="truncate text-caption leading-caption text-ash">
          {category} · {wallet} · {formatDate(occurredOn)}
        </span>
      </span>

      <span
        data-testid="transaction-amount"
        className={cn(
          "shrink-0 text-right text-body-lg leading-body-lg font-w450 tabular-nums",
          amountClass,
        )}
      >
        {formatAmountWithDirection(amount, currency, direction)}
      </span>
    </>
  );

  const shell = cn(
    "flex min-h-16 items-center gap-3 border-b border-border px-4 py-2",
    href && "hover:bg-secondary",
    className,
  );

  if (href) {
    return (
      <Link href={href} data-slot="transaction-row" data-testid="transaction-row" className={shell}>
        {body}
      </Link>
    );
  }

  return (
    <div data-slot="transaction-row" data-testid="transaction-row" className={shell}>
      {body}
    </div>
  );
}
