"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/ui/button";

/*
 * §6's app bar carries the search **entry point** as an icon button, not a permanently open field — the
 * mockup is explicit about the icon, and a 44px input parked under the month selector eats the first row of
 * the ledger on the one screen that is meant to be scanned.
 *
 * The field is a real feature of this app (FR-13: `?q=` over description, notes, merchant, and the names the
 * row's caption shows — category and wallets), so tapping the icon expands it over the app bar's title row
 * instead of navigating away. Three rules are kept from the previous inline version:
 *
 *   the URL is the state    `?q=` survives a reload, the back button and a share, exactly like `?month=`.
 *   the debounce is real    300ms of quiet before a request. Typing "warung" is five navigations otherwise.
 *   closing clears          a hidden filter that is still applied is the worst of both worlds: the list has
 *                           rows missing and nothing on screen says why.
 */
export function TransactionSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const applied = params.get("q") ?? "";

  const [open, setOpen] = useState(applied !== "");
  const [value, setValue] = useState(applied);

  /* "Clear filters" and the browser's back button both change `q` without going through this field, so the
     field re-syncs when the URL's value changes underneath it. Done during render rather than in an effect:
     React's own pattern for "reset state when a prop changes", and an effect here would render the stale value
     once before correcting it. */
  const [syncedTo, setSyncedTo] = useState(applied);
  if (applied !== syncedTo) {
    setSyncedTo(applied);
    setValue(applied);
  }

  useEffect(() => {
    if (!open) return;
    if (value.trim() === applied) return;

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [applied, open, params, pathname, router, value]);

  function close() {
    setOpen(false);
    setValue("");
    if (applied) {
      const next = new URLSearchParams(params.toString());
      next.delete("q");
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    }
  }

  if (!open) {
    return (
      <IconButton aria-label="Search transactions" data-testid="transaction-search-open" onClick={() => setOpen(true)}>
        <Search aria-hidden />
      </IconButton>
    );
  }

  return (
    <div data-slot="transaction-search" className="absolute inset-0 z-10 flex items-center gap-2 bg-canvas px-4 md:px-6">
      <input
        autoFocus
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
        placeholder="Search description, category or wallet"
        aria-label="Search description, category or wallet"
        className="h-11 min-w-0 flex-1 rounded-input border border-hairline bg-card px-3 text-body text-ink"
      />
      <IconButton aria-label="Close search" data-testid="transaction-search-close" onClick={close}>
        <X aria-hidden />
      </IconButton>
    </div>
  );
}
