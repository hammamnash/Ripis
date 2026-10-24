import {
  ArrowRightLeft,
  Banknote,
  Car,
  Circle,
  CircleArrowDown,
  CircleArrowUp,
  Gift,
  GraduationCap,
  HeartPulse,
  PawPrint,
  Receipt,
  Shirt,
  ShoppingBag,
  Sparkles,
  Ticket,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Amount } from "@/components/amount";
import type { CurrencyDisplay } from "@/src/lib/display-money";
import type { TransactionResponse } from "@/src/server/transactions/serialise";

/*
 * §5 "Transaction Row", ported from the mockup's own `txnRow`, not from the prose: 64px minimum, a hairline
 * bottom border, no card, full-bleed to the gutter, and three columns — a 36px icon circle, the note over its
 * meta line, and the figure at 17px/450.
 *
 * The response carries ids, not names, so the caller joins them and passes them in: the server module has no
 * business knowing what a wallet is *called*, and the row has no business querying.
 *
 * Two amount rules are easy to get wrong here:
 *
 *   colour by direction   an expense figure is `--color-negative`, an income `--color-positive`, and a transfer
 *                         or exchange stays ash. The sign still says which way the money went: an expense is
 *                         unprefixed, because `−Rp 50.000` is the shape for a balance in the negative, which is
 *                         a different fact (§5's `amount--negative`).
 *   exchange arrow        `transfer` and `exchange` both borrow the `→` mark: money left one wallet and
 *                         arrived in another, and §5 gives no separate mark for the second.
 *
 * The date is deliberately absent from the meta line. The list groups by day and labels the group, so
 * repeating it on all 45 rows is the same fact 45 times.
 */
const DIRECTION = {
  expense: "none",
  income: "income",
  transfer: "transfer",
  exchange: "transfer",
} as const;

/* Expense is the one direction whose tone is stated rather than inferred: `Amount` reads a sign from the
   direction, and an expense has none, so without this it would land on plain ink. An income and a transfer
   keep the tones their directions already imply. */
const TONE = { expense: "negative" } as const;

/* The glyph is the category's, tinted with the category's own colour — §5's row description and the mockup
   both key the circle on the category rather than on the type.
 *
 * `category.icon` is a free-text column and is empty on every category the app ships with, so the glyph is
 * resolved from the category's **name** when the column says nothing. Names are chosen by the user, so the
 * match is a keyword rather than an equality: "Food & Drink" and "Eating out" are the same glyph. Order
 * matters — the specific patterns come first, because "Personal Care" is not a car and "Petty cash" is not a
 * pet. A name nothing recognises falls through to the type's arrow rather than to a generic dot. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  transport: Car,
  shopping: ShoppingBag,
  clothes: Shirt,
  bills: Receipt,
  fun: Ticket,
  health: HeartPulse,
  edu: GraduationCap,
  gift: Gift,
  personal_care: Sparkles,
  pet: PawPrint,
  income: Banknote,
  other: Circle,
};

const NAME_ICONS: readonly (readonly [RegExp, string])[] = [
  [/personal\s*care|beauty|salon|hair|spa\b/i, "personal_care"],
  [/\bpet\b|\bvet\b|animal/i, "pet"],
  [/gift|donat|charit/i, "gift"],
  [/food|meal|eat|drink|coffee|restaurant|grocer|cafe/i, "food"],
  [/cloth|fashion|apparel|shirt|outfit/i, "clothes"],
  [/shopping/i, "shopping"],
  [/transport|fuel|petrol|\bgas\b|\bcar\b|ride|travel|taxi|parking|toll|train|\bbus\b|flight/i, "transport"],
  [/bill|utility|utilities|rent|house|home|electric|water|internet|phone|subscription/i, "bills"],
  [/fun|entertain|leisure|social|game|movie|hobby/i, "fun"],
  [/health|medical|doctor|pharmac|dentist|fitness|sport|gym/i, "health"],
  [/edu|school|course|book|tuition|learn/i, "edu"],
  [/salary|allowance|bonus|interest|refund|repay|wage|income|petty\s*cash|cash\s*back/i, "income"],
];

/** The key into `CATEGORY_ICONS`, never a component: resolving to a component inside render is exactly what
 *  `react-hooks/static-components` forbids, and a lookup here keeps the reference stable. */
function categoryIconKey(category: TransactionRowCategory | null | undefined): string | undefined {
  if (!category) return undefined;

  const stored = category.icon?.trim().toLowerCase();
  if (stored !== undefined && CATEGORY_ICONS[stored] !== undefined) return stored;

  return NAME_ICONS.find(([pattern]) => pattern.test(category.name))?.[1];
}

const TYPE_ICONS = {
  expense: CircleArrowDown,
  income: CircleArrowUp,
  transfer: ArrowRightLeft,
  exchange: ArrowRightLeft,
} as const;

export interface TransactionRowCategory {
  name: string;
  color: string;
  icon: string | null;
}

export function TransactionRow({
  transaction,
  walletName,
  destinationWalletName,
  category,
  currency,
  destination,
  walletInMeta = true,
}: {
  transaction: TransactionResponse;
  walletName: string;
  /** The wallet a transfer or exchange arrived in. A movement has two ends, and naming one of them is half
   *  the fact. */
  destinationWalletName?: string | null;
  category: TransactionRowCategory | null;
  currency: CurrencyDisplay;
  /** An exchange's received leg, rendered beneath the sent figure (`→ 5.000.000 ₫`). */
  destination?: { amount: string; currency: CurrencyDisplay } | null;
  /** `false` on a wallet's own ledger, where the title already names the wallet every row touched. */
  walletInMeta?: boolean;
}) {
  const type = transaction.transactionType;
  const typeLabel = type === "exchange" ? "Exchange" : type === "transfer" ? "Transfer" : null;
  const moved = type === "transfer" || type === "exchange";

  /* §14's free-text fields: the ledger's own name for the row is the note, then the description. The
     category (or the transfer's type name) is the fallback, because a row with no text at all is unclickable. */
  const note = transaction.notes ?? transaction.description ?? category?.name ?? typeLabel ?? "Transaction";

  /* A transfer has no category, so `category · wallet` would degrade to `Transfer · <one wallet>` — a caption
     that names the row's type twice and hides where the money went. The two wallets joined by the same arrow
     the amount uses are what that line is for. */
  const meta =
    moved && destinationWalletName
      ? `${walletName} → ${destinationWalletName}`
      : walletInMeta
        ? [category?.name ?? typeLabel ?? "—", walletName].join(" · ")
        : (category?.name ?? typeLabel ?? "—");

  const Icon = CATEGORY_ICONS[categoryIconKey(category) ?? ""] ?? TYPE_ICONS[type];

  return (
    <Link
      href={`/transactions/${transaction.id}`}
      data-slot="transaction-row"
      data-testid="transaction-row"
      className="-mx-4 flex min-h-16 items-center gap-3 border-b border-hairline px-4 py-2 transition-colors hover:bg-card md:-mx-6 md:px-6"
    >
      <span
        aria-hidden
        data-slot="transaction-icon"
        className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-secondary"
        style={category?.color ? { color: category.color } : undefined}
      >
        <Icon className="size-[18px]" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-lg leading-body-lg text-ink">
          {note}
          {transaction.tags.length > 0 ? (
            <span className="ml-1.5 inline-block rounded-tag border border-hairline px-1 py-px align-middle text-micro uppercase tracking-micro text-ash">
              #{transaction.tags[0]}
            </span>
          ) : null}
        </span>
        <span data-slot="transaction-meta" className="truncate text-caption leading-caption text-ash">
          {meta}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end text-right">
        <Amount
          value={transaction.amount}
          currency={currency}
          direction={DIRECTION[type]}
          tone={TONE[type as keyof typeof TONE]}
          smallMark={false}
          className="text-body-lg font-w450"
        />
        {destination ? (
          <Amount
            value={destination.amount}
            currency={destination.currency}
            direction="transfer"
            className="text-caption"
          />
        ) : null}
      </span>
    </Link>
  );
}

