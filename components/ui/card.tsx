import * as React from "react"
import { cn } from "cn"

/*
 * §5 "Wallet Card" and §2.2 level 1, themed. shadcn ships `rounded-xl`, `shadow-sm`, `gap-6`,
 * `py-6 px-6` and a `font-semibold` CardTitle. All four are defects here:
 *
 *   radius    `rounded-card`  (§2.5: cards are 16px — shadcn's xl resolves to --radius-hero, 20px)
 *   elevation `shadow-none`   (§2.6: cards are lifted by a hairline, never a shadow)
 *   padding   `p-5`           (§5 Wallet Card: 20px; §2.4 has no 24px step inside a card)
 *   title     `font-medium`   (§2.3 caps every weight at 500 — semibold is banned)
 *
 * The border is `border-border`, which globals.css maps to --color-hairline and the dark block
 * re-derives, so the card follows the theme without a second rule.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-card border border-border bg-card p-5 text-card-foreground shadow-none",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-body-lg font-w450 leading-body-lg text-foreground", className)}
      {...props}
    />
  )
}

/* §5 "Wallet Card": the wallet type sits in --text-caption ash, so the description is that role. */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-caption text-ash", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

/* The card already carries the 20px; content must not add a second one. */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("flex flex-col gap-3", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
