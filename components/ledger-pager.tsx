import Link from "next/link";
import type { ReactNode } from "react";

/*
 * The "Newer / Page n of m / Older" strip beneath a month of transactions.
 *
 * A list that silently stops at one page looks like data loss, so the pager states which page it is on and
 * carries the screen's current narrowing forward: stepping to page 2 of "expenses in October" must not
 * quietly become page 2 of every type. `page` is the one key this overwrites.
 *
 * A disabled step is a **span, not a link**: an href onto the page you are already reading is a control that
 * lies about being able to do something.
 */
export function LedgerPager({
  page,
  totalPages,
  basePath,
  query,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  /** The URL's current narrowing, so stepping a page keeps it. */
  query?: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number): string => {
    const params = new URLSearchParams({ ...query, page: String(target) });
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav
      data-slot="transaction-pager"
      className="flex items-center justify-between gap-3 px-4 pb-10 pt-2 md:px-6 md:pb-12"
    >
      <PagerLink href={href(page - 1)} disabled={page <= 1}>
        Newer
      </PagerLink>
      <p className="text-caption text-ash">
        Page {page} of {totalPages}
      </p>
      <PagerLink href={href(page + 1)} disabled={page >= totalPages}>
        Older
      </PagerLink>
    </nav>
  );
}

function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled="true" className="text-caption text-ash">
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className="text-caption text-ink underline underline-offset-4">
      {children}
    </Link>
  );
}
