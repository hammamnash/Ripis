"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/*
 * §5 "Toast", themed. shadcn ships a `--popover` toast at `var(--radius)`, top-right by default,
 * with its own icon set — every one of those is a defect here:
 *
 *   surface  `--surface-inverted`  §5: the toast is the app's inverted surface, not a popover
 *   text     Paper                 §5: "Paper text" — #ffffff in both themes, which is exactly why
 *                                  --color-paper is one of the tokens the theme parity test exempts
 *   radius   12px                  §5, and --radius-input is the only 12px step §2.5 defines
 *   padding  14px 16px             §5
 *   type     --text-small          §5
 *   duration 4s                    §5: "auto-dismiss 4s", not sonner's 4000 default by luck — the
 *                                  number is written down so a later sonner upgrade cannot move it
 *   position bottom, ABOVE THE BAR §5: "Bottom-anchored above the tab bar". The offset is computed
 *                                  from the same two terms the tab bar uses (its height and the
 *                                  safe-area inset) plus §6's 16px gap, so the toast sits on the
 *                                  FAB's line instead of behind the bar on a phone with a home
 *                                  indicator.
 *
 * The `!` on padding and font size is load-bearing, not laziness. Sonner injects its stylesheet
 * unlayered at runtime, and unlayered CSS beats every `@layer utilities` rule regardless of
 * specificity — so a plain `p-4` here would be silently outranked and §5's 14px would never appear.
 * An important is the honest way to win that specific fight; a `!important` in globals.css would be
 * a global override the next component cannot escape.
 *
 * No `richColors`. §3 scopes the status colours and §5 gives the toast one surface for all of them;
 * sonner's green-on-green success toast is a second, unmeasured palette.
 */
const TOAST_OFFSET = "calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 16px)"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      duration={4000}
      offset={TOAST_OFFSET}
      mobileOffset={TOAST_OFFSET}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "!px-4 !py-[14px] !text-small",
          /* §5's one action is Undo, and it is a text action — a filled button inside an inverted
             toast would be the second accent on a screen that may already have one. */
          actionButton: "!bg-transparent !text-paper underline",
          cancelButton: "!bg-transparent !text-paper/70",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface-inverted)",
          "--normal-text": "var(--color-paper)",
          "--normal-border": "var(--surface-inverted)",
          "--border-radius": "var(--radius-input)",
          "--width": "calc(100vw - 32px)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
