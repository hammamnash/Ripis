"use client";

import { cn } from "cn";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * §6 "Floating Action Button" — 56px, ink fill, a Paper `+`, at the right gutter. Two offsets are
 * fixed and both matter: 16px from the gutter, and 16px *above the tab bar* — not above the
 * viewport. The bar is fixed and grows by the safe-area inset, so the gap is computed from the same
 * two terms the bar uses; a hard-coded `bottom: 80px` would touch the bar on one device and float
 * 50px off it on another.
 *
 * The `+` is a route, not a modal: it opens the add-transaction screen (§6's "expands to three
 * items (Expense / Income / Transfer)" is a screen-level affordance that arrives with that screen,
 * not something the rail can decide). Keeping it a Link also means it works with JavaScript
 * disabled and needs no state.
 *
 * Hidden on the add screens themselves — a button that opens the screen you are already on is the
 * one place a FAB is wrong (§6).
 */
const HIDDEN_ON = ["/transactions/new"] as const;

export function Fab({
  href = "/transactions/new",
  label = "Add transaction",
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  const pathname = usePathname();

  if (HIDDEN_ON.some((hidden) => pathname.startsWith(hidden))) return null;

  return (
    <Link
      href={href}
      aria-label={label}
      data-slot="fab"
      data-testid="fab"
      className={cn(
        /* §6 says "ink fill", and §5 says why that cannot be `bg-ink`: --color-ink is Bone in
           dark, so an ink-filled circle would carry a Paper glyph into a light-on-light washout.
           `bg-primary` maps to --surface-primary — #0c0a08 in light, #262220 in dark — which is
           the same value §5 uses for the primary pill, and the reason the token exists. */
        "fixed right-4 z-40 flex size-[var(--fab-size)] items-center justify-center rounded-pill bg-primary text-primary-foreground shadow-raised",
        "bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+16px)]",
        className,
      )}
    >
      <Plus aria-hidden className="size-6" />
    </Link>
  );
}
