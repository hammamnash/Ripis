"use client";

import { cn } from "cn";
import { ArrowLeftRight, ChartPie, House, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
 */
const TABS = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: ChartPie },
  { href: "/wallets", label: "Wallets", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      data-slot="tab-bar"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        /* "/" would otherwise match every route, so the dashboard is exact and the rest match their
           subtree — /transactions/new keeps Transactions lit. */
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

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
