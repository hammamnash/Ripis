"use client"

import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

/*
 * §2.6 "dialogs get --shadow-overlay" plus §5's Bottom Sheet material, themed. shadcn ships
 * `rounded-lg` (which globals.css folds onto 16px, but §2.5 gives cards and sheets 16px and only a
 * hero 20px), `bg-background` (the canvas — a modal must be --surface-card, level 1), `shadow-lg`
 * (a fourth shadow the design does not have), `p-6`, `font-semibold` titles, its own
 * `focus:ring-2` on the close button, and a `variant="outline"` Cancel button — a variant §5 does
 * not define, which is why the build was red.
 *
 * Motion is `duration-[240ms]` + `ease-out`, not shadcn's `duration-200 ease-in-out`: §2.7 allows
 * 120–200ms for a state change and 240ms for sheet entry. The duration is a literal because
 * `--duration-*` is not a Tailwind theme namespace — `duration-sheet` compiles to nothing, exactly
 * like the `font-regular` trap globals.css records. `ease-out` *is* a namespace, and globals.css
 * re-declares `--ease-out` as §11's cubic-bezier(.22, 1, .36, 1), so the bare class resolves to the
 * contract's curve rather than Tailwind's default.
 *
 * §5 is explicit that filters, pickers and confirmation are a **Bottom Sheet**, "not a full-screen
 * modal, which on a phone buries the context". So this component is the desktop-width counterpart
 * of Sheet: same material, same radius, same overlay, centred rather than anchored to the bottom
 * edge. A screen that reaches for Dialog on a phone width is the defect §5 names, not a style
 * choice — the screens in §7 use Sheet.
 *
 * The scrim is `bg-panel/60`, not shadcn's `bg-black/50`: --color-panel is obsidian in light and
 * the raised #262220 in dark, so the dimming follows the theme instead of washing a warm dark canvas
 * with neutral black.
 */
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-panel/60",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6",
          "rounded-card border border-border bg-card p-6 text-card-foreground shadow-overlay",
          "duration-[240ms] ease-out",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          /* §9's 44px floor: shadcn's close button is a bare 16px icon with 4px of padding. The
             circle stays visually small; the target is size-11. No ring classes — globals.css owns
             the one focus treatment (§2.8), and shadcn's `ring-2 ring-offset-2` is a second one. */
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-pill text-ash transition-colors hover:text-foreground disabled:pointer-events-none"
          >
            <XIcon className="size-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          {/* §5 "Pill Button — Ghost" is the secondary action beside a primary: transparent,
              1px ink border, ink text. shadcn's `outline` variant does not exist here. */}
          <Button variant="ghost">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

/* §2.3 caps weight at 500 and §5's sheets lead with the serif on a top-level screen. A modal title
   is a subheading, not a screen title, so it stays sans at --text-subheading/450. */
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-subheading font-w450 leading-subheading text-foreground", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-body text-ash", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
