import { cn } from "cn";

import { amountParts, type AmountDirection, type CurrencyDisplay } from "@/src/lib/display-money";

/*
 * The tone is applied as a `color` declaration rather than as a `text-*` utility, and that is deliberate.
 * `cn` is tailwind-merge, which sorts `text-*` by value: this design's sizes (`text-body-lg`, `text-caption`,
 * `text-subheading` …) are not sizes tailwind-merge knows, so it files each of them in the **text-colour**
 * group. A component writing `cn("tabular-nums", "text-positive", "text-body-lg")` therefore has its colour
 * merged away and survives as an ink figure — which is exactly what happened to every amount on the
 * transactions list, the budget bars and the detail screen before this. Naming the token variable removes the
 * ambiguity: there is no class for anything to merge.
 *
 * `panel*` are the theme-fixed roles for text on the inverted band (§2.9 rule 4): the panel is dark in both
 * themes, so `--color-ash` / `--color-positive` would fail contrast on it and must never be used there.
 */
const TONE = {
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  ash: "var(--color-ash)",
  ink: "var(--color-ink)",
  paper: "var(--color-paper)",
  panelAsh: "var(--color-ash-on-panel)",
  panelPositive: "var(--color-positive-on-panel)",
  panelNegative: "var(--color-negative-on-panel)",
} as const;

/*
 * A direction implies a tone when the caller states none: money in is positive, money moved is ash. An expense
 * implies **nothing** — an unprefixed figure on its own line is not a status, so it keeps whatever colour its
 * `className` asks for (or inherits), and a screen that wants it in `--color-negative` says `tone="negative"`.
 */
const IMPLIED: Partial<Record<AmountDirection, keyof typeof TONE>> = {
  income: "positive",
  transfer: "ash",
};

/* §5: sign, then mark, then digits. The spoken form is rendered whole for assistive tech, because the visual
   form is three spans with CSS spacing that no reader would announce sensibly.

   `smallMark` is the one typographic choice the contract leaves to the surface. A transaction row states its
   figure at 17px/450 and the whole amount — mark included — is one weight and one colour, so the row passes
   `smallMark={false}`. A day total and a budget caption keep the small mark, which inherits the figure's
   colour exactly as §5's `.amount__mark { font-weight: inherit }` does. */
export function Amount({ value, currency, direction = "none", tone, className, markClassName, smallMark = true }: {
  value: string;
  currency: CurrencyDisplay;
  direction?: AmountDirection;
  tone?: keyof typeof TONE;
  className?: string;
  markClassName?: string;
  /** `true` (default) drops the mark to `--text-caption`; `false` lets it inherit the figure's type. */
  smallMark?: boolean;
}) {
  const parts = amountParts(value, currency, direction);
  const resolved = tone ?? IMPLIED[direction];
  const spoken = parts.suffix ? `${parts.sign}${parts.digits} ${parts.mark}` : `${parts.sign}${parts.mark} ${parts.digits}`;
  const mark = smallMark ? cn("text-[length:var(--text-caption)]", markClassName) : markClassName;

  return (
    <span
      data-slot="amount"
      data-direction={direction}
      style={resolved ? { color: TONE[resolved] } : undefined}
      className={cn("tabular-nums", className)}
    >
      <span className="sr-only">{spoken}</span>
      <span aria-hidden className="inline-flex items-baseline">
        {parts.sign ? <span className="mr-[0.08em]">{parts.sign}</span> : null}
        {parts.suffix ? null : <span className={cn("mr-[0.24em]", mark)}>{parts.mark}</span>}
        <span>{parts.digits}</span>
        {parts.suffix ? <span className={cn("ml-[0.24em]", mark)}>{parts.mark}</span> : null}
      </span>
    </span>
  );
}
