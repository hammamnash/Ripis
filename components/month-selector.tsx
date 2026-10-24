import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/*
 * §5 "Month Selector": `‹ October 2026 ›`, chevrons at 44px targets, centre label 17px/450 tabular.
 *
 * Two decisions worth naming:
 *
 * Navigation is two `Link`s, not two `onClick` handlers. The month is a `?month=yyyy-mm` search
 * param, so the previous month is a URL that a browser can prefetch, a reload can reproduce, and
 * a test can assert without a script. It also means this component ships no JavaScript and works
 * before hydration — on a phone, a chevron that does nothing for 300ms reads as broken.
 *
 * This component is deliberately NOT sticky. §5 says "sticky under the header", and the header
 * already is (§6): the selector renders as `ShellHeader`'s child, inside one sticky block, so there
 * is no second `top` offset to keep in sync with the title's line height.
 *
 * The label is text for now, not a button. §5's "tapping the label opens a month/year picker sheet"
 * arrives with the Bottom Sheet it needs (Task 7.4b) — a button that opens nothing is worse than a
 * label that honestly does not, and the picker's copy belongs with the sheet's.
 */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `yyyy-mm` + a month delta. String arithmetic, never a `Date`: a local Date at a month boundary
 *  is a timezone bug waiting for the one user who is awake at 23:00 on the 31st (ADR-0007). */
export function shiftMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`month-selector: expected yyyy-mm, got ${month}`);

  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  const monthIndex = ((index % 12) + 12) % 12;

  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`month-selector: expected yyyy-mm, got ${month}`);
  const name = MONTHS[Number(match[2]) - 1];
  if (!name) throw new Error(`month-selector: month out of range, got ${month}`);
  return `${name} ${match[1]}`;
}

export function MonthSelector({
  month,
  basePath,
  currentMonth,
  className,
}: {
  /** `yyyy-mm`. */
  month: string;
  /** The screen's path, so the links are absolute rather than reload-relative. */
  basePath: string;
  /**
   * The latest month that may be reached, as `yyyy-mm`. §5 and the mockup both say forward is **disabled at
   * the current month rather than hidden** — a chevron that disappears leaves the user wondering whether the
   * screen lost it, and one that stays but dims states the edge of the ledger. Omitted, both directions work,
   * which is what a screen summarising a closed period wants.
   */
  currentMonth?: string;
  className?: string;
}) {
  const chevron =
    "flex size-[var(--target-min)] shrink-0 items-center justify-center rounded-pill text-ink";

  /* `yyyy-mm` compares correctly as a string: fixed width, zero-padded, most-significant first. */
  const atLatest = currentMonth !== undefined && month >= currentMonth;

  return (
    <div
      data-slot="month-selector"
      data-testid="month-selector"
      className={cn("flex items-center justify-between px-2 pb-1 md:mx-auto md:w-full md:max-w-[22rem]", className)}
    >
      <Link
        href={`${basePath}?month=${shiftMonth(month, -1)}`}
        aria-label="Previous month"
        data-testid="month-prev"
        className={chevron}
      >
        <ChevronLeft aria-hidden className="size-5" />
      </Link>

      <span data-testid="month-label" className="text-body-lg font-w450 tabular-nums text-ink">
        {monthLabel(month)}
      </span>

      {atLatest ? (
        <span
          role="link"
          aria-disabled="true"
          aria-label="Next month"
          data-testid="month-next"
          className={cn(chevron, "cursor-default opacity-[0.35]")}
        >
          <ChevronRight aria-hidden className="size-5" />
        </span>
      ) : (
        <Link
          href={`${basePath}?month=${shiftMonth(month, 1)}`}
          aria-label="Next month"
          data-testid="month-next"
          className={chevron}
        >
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      )}
    </div>
  );
}
