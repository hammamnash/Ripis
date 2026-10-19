"use client"

import * as React from "react"
import { cn } from "cn"
import { Label as LabelPrimitive } from "radix-ui"

/*
 * §5 "Form Fields" — "Label: --text-micro, uppercase, ash, 11px."
 *
 * That is text-micro, uppercase and text-muted-foreground (the mapping points --muted-foreground at
 * --color-ash). The 6px between label and control is NOT here: §5 describes a form field, and this
 * is the primitive — the gap belongs to the field composition, which lands with the screens that
 * build one (Task 7.4c).
 *
 * Weight stays at shadcn's 500, which §2.3's ceiling allows and §2.3 bans nothing below.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-micro font-medium text-muted-foreground uppercase select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
