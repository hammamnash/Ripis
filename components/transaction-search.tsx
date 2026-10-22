"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function TransactionSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);

  useEffect(() => setValue(initial), [initial]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (value === initial) return;
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [initial, pathname, params, router, value]);

  return (
    <input
      name="q"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder="Search description or notes"
      aria-label="Search description or notes"
      className="h-11 min-w-0 flex-1 rounded-[10px] border border-hairline bg-card px-3 text-body text-ink"
    />
  );
}
