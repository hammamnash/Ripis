import * as React from "react"
import { cn } from "cn"

/*
 * §5 "Form Fields" — "Input: height 48px, radius 12px, --surface-card fill, 1px solid
 * --color-hairline, padding 0 14px, Inter 17px ink. Focus swaps the border to ink and adds the §2.8
 * focus ring."
 *
 * Each of those is a class: h-12, rounded-input, bg-card, border-input (the mapping points --input
 * at --color-hairline), px-[14px], text-body-lg. The focus swap is `focus-visible:border-foreground`;
 * the ring itself is NOT here, because §2.8's ring is global in globals.css and one focus treatment
 * is the point. shadcn's `outline-none` and `focus-visible:ring-*` are removed for that reason.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-input border border-input bg-card px-[14px] text-body-lg font-regular text-foreground transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:border-foreground",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        /* §5: "Error: border --color-negative, message below in --text-caption --color-negative." */
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
