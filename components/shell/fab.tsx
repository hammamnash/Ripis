"use client";

import { cn } from "cn";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { hidesAdd } from "@/components/shell/nav";

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
 * one place a FAB is wrong (§6). The list lives in `nav.ts` beside the rail's own "Add transaction"
 * button, which replaces this one from 768px up: on a wide screen a floating circle lands on top of
 * the content it is meant to sit beside, and the rail has a column for it.
 */
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

  if (hidesAdd(pathname)) return null;

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
        "fixed right-4 bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+16px)] z-40 flex size-[var(--fab-size)] items-center justify-center rounded-pill bg-primary text-primary-foreground shadow-raised",
        "md:hidden",
        className,
      )}
    >
      <Plus aria-hidden className="size-6" />
    </Link>
  );
}
