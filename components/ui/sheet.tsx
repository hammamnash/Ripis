"use client"

import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

/*
 * §5 "Bottom Sheet", themed. This file was committed as raw shadcn in 6465e7f ("shadcn/ui installed
 * and themed to §5") but never actually themed — every default was still in place, so the surface
 * §7's filters, pickers and confirmations use was the one place the contract did not reach. Task
 * 7.2a fixed it:
 *
 *   fill      `bg-card`       §5: --surface-card, level 1
 *   radius    `rounded-t-card` (bottom) / `rounded-card` (top)  §5: `20px 20px 0 0` is the SHEET's
 *             own radius — §2.5's 20px is --radius-hero, and §5 writes the two bottom corners as 0.
 *             The side variants keep 16px because §5 only specifies the bottom sheet; a right-hand
 *             drawer is not in §7, and inventing 20px for it would be a second guess.
 *   elevation `shadow-overlay`  §2.6: sheets get --shadow-overlay, never shadcn's `shadow-lg`
 *   motion    `duration-[240ms]` + `ease-out`, 240ms per §5. shadcn shipped 300/500ms and
 *             `ease-in-out`; §2.7 allows 240ms for sheet entry and names `ease-out`. The duration
 *             is a literal because `--duration-*` is not a Tailwind theme namespace — a
 *             `duration-sheet` class would compile to nothing.
 *   scrim     `bg-panel/60`   §5/§2.9: --color-panel is obsidian in light and #262220 in dark, so
 *             the dimming follows the theme instead of `bg-black/50` washing a warm canvas.
 *   padding   24px per §5, replacing shadcn's 16px
 *   title     `font-w450`     §2.3 caps every weight at 500; `font-semibold` (600) is banned
 *   focus     removed         §2.8's ring is global in globals.css; shadcn's `focus:ring-2
 *             ring-offset-2` was a second, unmeasured treatment
 *
 * The drag handle §5 describes is a separate component (§5: 36×4px --color-smoke, 12px from top)
 * and is not shadcn's to supply — screens render it.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-panel/60",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-6 border-border bg-card text-card-foreground shadow-overlay",
          "transition ease-out data-[state=closed]:animate-out data-[state=closed]:duration-[240ms] data-[state=open]:animate-in data-[state=open]:duration-[240ms]",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l p-6 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r p-6 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto rounded-b-card border-b p-6 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          /* §5: radius `20px 20px 0 0`, and the safe-area inset keeps the last action above the
             home indicator on a phone — the sheet is bottom-anchored, so this is the one variant
             that needs it. */
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto rounded-t-card border-t p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          /* §9's 44px floor. The glyph stays 20px; the target is size-11. No ring classes —
             globals.css owns the one focus treatment (§2.8). */
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-pill text-ash transition-colors hover:text-foreground disabled:pointer-events-none"
          >
            <XIcon className="size-5" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/* The sheet already carries its 24px; the header must not add a second one. */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 text-left", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

/* §2.3 caps weight at 500. A sheet is a filter or a picker, not a top-level screen, so the title
   stays sans at --text-subheading rather than taking the serif §5 reserves for screen titles. */
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-subheading font-w450 leading-subheading text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-body text-ash", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
