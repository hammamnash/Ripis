import { cn } from "cn";
import type { ReactNode } from "react";

import { BackButton } from "@/components/shell/back-button";

/*
 * §6 "Header": sticky, `--surface-canvas` (not Paper) with a hairline bottom border, "so it
 * dissolves into the page". Canvas rather than card is the load-bearing part — a white bar over a
 * bone canvas reads as a second surface competing with the content.
 *
 * Three things the contract fixes that a default header gets wrong:
 *
 *   title    serif at --text-heading on a top-level screen, sans at --text-subheading on a nested
 *            one. Both, not one: the type change is how the app says "you are one level down"
 *            without adding a breadcrumb. `variant` is that switch and has no third value.
 *   back     a 44px target, not the 24px chevron the eye sees. §6: "including cheque-sized
 *            controls like chevrons". The glyph stays 24px and the target is padded around it —
 *            the same split as §5's Icon Button.
 *   position sticky, `top-0`, inside the page's own scroll. Sticky rather than fixed so the
 *            header occupies layout space and nothing has to know its height (which changes with
 *            the title variant) to offset the content beneath it.
 *
 * `children` renders inside the sticky block, below the title row. That is where §5's Month
 * Selector goes: "Sticky under the header" — one sticky element instead of two stacked ones
 * fighting over a `top` offset that depends on the title's line height.
 */
export function ShellHeader({
  title,
  variant = "top",
  backHref,
  action,
  children,
  className,
}: {
  title: string;
  variant?: "top" | "nested";
  backHref?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="shell-header"
      data-testid="shell-header"
      className={cn("sticky top-0 z-30 border-b border-border bg-canvas", className)}
    >
      <div className="relative flex min-h-[var(--target-min)] items-center gap-2 px-4 py-3 md:px-6">
        {backHref ? <BackButton href={backHref} /> : null}

        <h1
          className={cn(
            "min-w-0 flex-1 truncate text-ink",
            variant === "top"
              ? "font-serif text-heading leading-heading tracking-tight"
              : "font-sans text-subheading leading-subheading",
          )}
        >
          {title}
        </h1>

        {action}
      </div>

      {children}
    </header>
  );
}
