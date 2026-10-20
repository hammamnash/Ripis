import { cn } from "cn";

import { amountParts, type AmountDirection, type CurrencyDisplay } from "@/src/lib/display-money";

const TONE = { positive: "text-positive", negative: "text-negative", ash: "text-ash", ink: "text-ink" } as const;

/* §5: sign, then mark, then digits. The spoken form is rendered whole for assistive tech, because the visual
   form is three spans with CSS spacing that no reader would announce sensibly. */
export function Amount({ value, currency, direction = "none", tone, className, markClassName }: {
  value: string;
  currency: CurrencyDisplay;
  direction?: AmountDirection;
  tone?: keyof typeof TONE;
  className?: string;
  markClassName?: string;
}) {
  const parts = amountParts(value, currency, direction);
  const resolved = tone ?? (direction === "income" ? "positive" : direction === "transfer" ? "ash" : "ink");
  const spoken = parts.suffix ? `${parts.sign}${parts.digits} ${parts.mark}` : `${parts.sign}${parts.mark} ${parts.digits}`;

  return (
    <span data-slot="amount" data-direction={direction} className={cn("tabular-nums", TONE[resolved], className)}>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden className="inline-flex items-baseline">
        {parts.sign ? <span className="mr-[0.08em]">{parts.sign}</span> : null}
        {parts.suffix ? null : <span className={cn("mr-[0.24em] text-caption text-ash", markClassName)}>{parts.mark}</span>}
        <span>{parts.digits}</span>
        {parts.suffix ? <span className={cn("ml-[0.24em] text-caption text-ash", markClassName)}>{parts.mark}</span> : null}
      </span>
    </span>
  );
}
