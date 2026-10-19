import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * §5 "Pill Button" and "Icon Button", themed from §11's tokens. No shadcn default survives here —
 * ADR-0006 and §11 both say its defaults are a bug, not a starting point. Every line below is a
 * sentence out of §5:
 *
 *   radius `9999px`  -> rounded-pill      (--radius-pill)
 *   height 48px      -> h-12              (§5 fixes the pill's height; 48px is 3rem)
 *   padding `0 24px` -> px-6
 *   Inter 17px/400   -> text-body-lg font-regular   (--text-body-lg, --font-weight-regular)
 *   Primary is INK, not the accent — "so the accent stays scarce and never competes with status colour"
 *   destructive is text-only in --color-negative — "destructive actions are never a coloured button"
 *
 * The colour classes are shadcn's own names on purpose. globals.css maps them onto our tokens
 * (--primary -> --surface-primary, --accent -> --surface-action, --secondary -> --surface-wash,
 * --destructive -> --color-negative), so writing `bg-primary` here resolves *through* the mapping
 * instead of reaching past it to a hex.
 *
 * Two things shadcn ships that are deliberately gone:
 *   - `outline-none`: it suppresses §2.8's focus ring, which globals.css now owns globally. A
 *     component that opts out of it is a keyboard hole, and this one is on every screen.
 *   - `focus-visible:ring-*`: the same reason, from the other side. One focus treatment, and it is
 *     the one whose contrast was measured.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-pill text-body-lg font-regular whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* §5 Pill Button — Primary. --surface-primary is #0c0a08 in light, #262220 in dark. */
        primary: "bg-primary text-primary-foreground",
        /* §5 Pill Button — Highlighter (rare): --surface-action fill, --color-on-action text. "One
           per screen, maximum" is a screen rule, so this variant does not enforce it — §5's
           sentence does, and a component that counted its siblings would be guessing. */
        highlighter: "bg-accent text-accent-foreground",
        /* §5 Pill Button — Ghost: transparent, 1px solid ink, ink text. */
        ghost: "border border-foreground text-foreground",
        /* §5 Pill Button — Tertiary / Link: no fill, no border; hover fills --surface-wash. */
        tertiary: "text-foreground hover:bg-secondary",
        /* §5: destructive is text only, in --color-negative, with no fill. */
        destructive: "text-destructive hover:bg-secondary",
      },
      size: {
        /* §5 defines exactly one pill size. A size the contract does not define is a size nobody
           approved, so there is no sm/lg/xs here. */
        default: "h-12 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/*
 * §5 "Icon Button" — its own entry in §5, so its own component: the fill belongs to the circle, not
 * to the button. §5 specifies a `40px × 40px` circle and §9 a 44×44 minimum target, so the button is
 * the 44px target and the ::before pseudo-element is the 40px circle drawn inside it. Both rules
 * hold, and no caller has to know.
 */
function IconButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="icon-button"
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50",
        "before:absolute before:size-10 before:rounded-pill before:bg-secondary before:content-['']",
        "[&_svg]:relative [&_svg]:pointer-events-none [&_svg]:size-5",
        className
      )}
      {...props}
    />
  )
}

export { Button, buttonVariants, IconButton }
