"use client";

import { cn } from "cn";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { hidesAdd, isActive, NAV_ITEMS } from "@/components/shell/nav";

/*
 * §6's five items again, for the widths where a thumb is not what is pointing: from 768px up the tab
 * bar becomes a fixed rail on the left and the content column moves over by its width.
 *
 * A rail rather than a wider tab bar because the phone's five labels are the thing that would not
 * stretch: 768px of bar is 768px of whitespace between five words. Vertically they stay legible at
 * their caption size and the content gets the horizontal room instead.
 *
 * The active item carries two cues, not one — ink text on a card surface plus a 450 weight, against
 * ash at 400 for the rest — because §9 forbids leaving the state to colour alone.
 */
export function SideRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      data-slot="side-rail"
      data-testid="side-rail"
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-width)] flex-col gap-1 border-r border-hairline bg-canvas px-3 py-6 md:flex"
    >
      <p className="px-3 pb-6 font-serif text-heading-sm leading-heading-sm text-ink">Ripis</p>

      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-testid={`rail-${label.toLowerCase()}`}
            className={cn(
              "flex min-h-[var(--target-min)] items-center gap-3 rounded-input px-3 text-small transition-colors",
              active
                ? "bg-card font-w450 text-ink"
                : "text-ash hover:bg-card hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-5 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}

      {/* The FAB's desktop form: the same route, the same ink fill, at the foot of the column instead of
          on top of the content. Hidden on the screens that are the destination (§6). */}
      {hidesAdd(pathname) ? null : (
        <Link
          href="/transactions/new"
          data-testid="rail-add"
          className="mt-auto flex min-h-[var(--target-min)] items-center justify-center gap-2 rounded-pill bg-primary px-4 text-small text-primary-foreground"
        >
          <Plus aria-hidden className="size-4" />
          Add transaction
        </Link>
      )}
    </nav>
  );
}
