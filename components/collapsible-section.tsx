import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/*
 * A section that keeps its heading on screen and folds the rows beneath it away.
 *
 * It is a native `<details>`, not a `useState` toggle: the disclosure then works before hydration, answers
 * keyboard and screen-reader input for free, and ships no JavaScript. `defaultOpen` names the state the
 * screen arrives in — a caller that has nothing to fold passes `true` so the empty state stays visible.
 *
 * The heading is the `<summary>`, so the whole title line is the tap target (44px tall) and the chevron
 * says which way it will move. The section's action (`All wallets →`) rides the same line: a disclosure
 * that hides the only link to the wallets screen would trap the one user who came to open a wallet.
 */
export function CollapsibleSection({
  title,
  action,
  defaultOpen = false,
  children,
}: {
  title: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      data-slot="collapsible-section"
      className="group flex flex-col gap-3"
      open={defaultOpen || undefined}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-1.5 text-subheading text-ink">
          {title}
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-ash motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
          />
        </h2>
        {action}
      </summary>
      <div className="flex flex-col gap-3">{children}</div>
    </details>
  );
}
