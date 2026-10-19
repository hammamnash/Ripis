"use client"

import * as React from "react"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

/*
 * §5 "Segmented Control", themed. shadcn's Tabs ships a grey `bg-muted` pill list, `rounded-lg`,
 * `h-9` (36px), `text-sm font-medium`, a `focus-visible:ring-[3px]` of its own, and a `line`
 * variant with an underline marker. Every one of those is a defect here:
 *
 *   height    `h-11`           §5: 44px tall — the segmented control is a touch target
 *   track     `bg-secondary`   §5: --surface-wash, 4px inner padding
 *   radius    `rounded-input`  §5: 12px on the track
 *   thumb     `bg-card` + hairline  §5: "Selected thumb: --surface-card with hairline — never
 *                              --color-highlighter, including when it selects a money direction"
 *   weight    `font-w450`      §2.3 caps at 500; shadcn's `font-medium` is 500 so it survives, but
 *                              the thumb's label is the selected state and takes 450 like a card title
 *   focus     removed          §2.8's ring is global (globals.css), and shadcn's own ring is a second,
 *                              unmeasured treatment. TabsTrigger also gets `rounded-input` so the
 *                              inherited ring follows the thumb instead of the track.
 *
 * The `line` variant is gone rather than restyled: §5 defines one segmented control and no tab
 * strip, and a variant the contract does not define is a variant nobody approved (same reasoning
 * as button.tsx having exactly one pill size). Section switching inside a screen is §7's sub-nav,
 * which is a header title change, not a tab strip.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("group/tabs flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-11 w-full items-center gap-1 rounded-input bg-secondary p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-full flex-1 items-center justify-center gap-2 rounded-input border border-transparent px-3 text-body whitespace-nowrap text-ash transition-colors",
        "hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:font-w450 data-[state=active]:text-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  /* No `outline-none`: globals.css owns focus, and suppressing it here would leave the panel
     unfocusable for a keyboard user moving into it. */
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
