"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive, NAV_ITEMS } from "@/components/shell/nav";

/*
 * §6 "Bottom Tab Bar" — five items, always. The height is 64px *plus* the safe-area inset, so the
 * bar's own box grows on a device with a home indicator instead of its labels sliding under it:
 * `h-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))]` with the inset as padding, not as
 * part of the 64.
 *
 * `env()` only reports a non-zero inset when the document asks for it (`viewport-fit=cover`, set in
 * app/layout.tsx). Without that meta the inset is 0 on every device and this rule silently does
 * nothing — the bar looks right in a desktop browser and wrong on the phone it was built for.
 *
 * The active item is --color-ink, and the highlight is *not* --color-highlighter: §6 reserves the
 * highlighter for the balance hero and §10 #3 names "highlighter on a tab bar" as the tell of the
 * generic product. The label carries the state as well as the icon (weight, not just colour) so a
 * monochrome reader still sees which tab is open.
 *
 * There is no sixth item. Recurring (screen 10) is V1.1, and a disabled tab for a screen that does
 * not exist is a promise the rail cannot keep.
 *
 * From 768px up the bar is gone and `SideRail` carries the same five items — the list lives in
 * `nav.ts` so the two never disagree about the frame's destinations.
 */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      data-slot="tab-bar"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-testid={`tab-${label.toLowerCase()}`}
            data-active={active ? "true" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1",
              active ? "text-ink" : "text-ash",
            )}
          >
            <Icon aria-hidden className="size-6" />
            <span className="text-micro leading-micro tracking-micro">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
