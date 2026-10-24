"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/*
 * §6's back control: a 44px target around a 24px chevron, top-left of the header.
 *
 * It is a real link — the fallback is what a browser with JS off follows, and what a middle-click opens — but
 * when the page was reached from somewhere in this app the click steps back through history instead. That is
 * the difference between returning to the month and filters you left and returning to a fresh, unfiltered
 * list: this screen keeps its state in the URL, so only the history entry still holds it.
 */
export function BackButton({ href }: { href: string }) {
  const router = useRouter();

  return (
    <Link
      href={href}
      aria-label="Back"
      data-testid="shell-back"
      onClick={(event) => {
        /* A modified click is a new tab or a download: it wants the href, not the history entry. */
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!canGoBack()) return;

        event.preventDefault();
        router.back();
      }}
      /* -ml-2 keeps the 44px target from pushing the title away from the gutter; the target is what a
         thumb hits, the gutter is what the eye sees. */
      className="-ml-2 flex size-[var(--target-min)] shrink-0 items-center justify-center rounded-pill text-ink"
    >
      <ChevronLeft aria-hidden className="size-6" />
    </Link>
  );
}

/* A tab opened straight on this page — a bookmark, a shared link, a new tab — has no entry to step back into,
   so it takes the fallback href rather than appearing to do nothing. `document.referrer` is not the test:
   it describes the document, so it is empty after every client-side navigation. */
function canGoBack(): boolean {
  return window.history.length > 1;
}
