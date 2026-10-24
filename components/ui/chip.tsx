import * as React from "react";
import { cn } from "cn";

/*
 * §5 "Chip": radius 6px (`--radius-tag`), padding `6px 10px`, `--text-small`, `--surface-wash` fill, ash
 * text, an optional 8px dot. Selected is **ink fill with Paper text** — never the highlighter, which is the
 * one-per-screen accent and would compete with the money on a ledger.
 *
 * It is a real `<button>` rather than a styled `<div>`: every use of it in this app is a control, and
 * `aria-pressed` is only meaningful on one. The transactions list wraps its chips in a `method="get"` form so
 * the filter is a URL (`?type=expense`) and works before hydration; the caller passes `type="submit"`, which
 * this component does not set, because a chip that is part of a form must be allowed to submit it.
 *
 * `shrink-0` is part of the base: chips live in a horizontally scrolling row (`.chiprow`), and a flex item
 * that is allowed to shrink would silently truncate "Transfer" to "Transf".
 */
export function Chip({
  selected = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      data-slot="chip"
      data-selected={selected ? "true" : undefined}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-tag border border-transparent px-2.5 py-1.5",
        "text-small leading-small transition-colors",
        "hover:border-hairline",
        selected ? "bg-ink text-canvas" : "bg-secondary text-ash",
        className,
      )}
      {...props}
    />
  );
}

/** The count beside a chip's label. Inherits the chip's colour at 75% — `opacity` on the span, so a selected
 *  chip's count is Paper-on-ink rather than a second ash colour that only reads on a wash fill. */
export function ChipCount({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums opacity-75">{children}</span>;
}

/** The optional 8px dot (§5). Colour is the caller's — a category's own, or a status token. */
export function ChipDot({ color }: { color?: string }) {
  return <span aria-hidden className="size-2 shrink-0 rounded-pill" style={color ? { backgroundColor: color } : undefined} />;
}
