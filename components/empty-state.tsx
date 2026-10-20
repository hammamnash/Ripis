import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/*
 * §5 "Empty State": centred column, 24px padding, max-width 320px, a 48px hairline-stroke glyph in
 * ash, title at --text-subheading, one sentence at --text-body ash, and **one** action.
 *
 * The cap is 320px rather than a breakpoint because the copy is the constraint: a sentence that
 * needs more than 320px is a paragraph, and §5's rule is that the sentence states what to do
 * ("Add your first wallet to start tracking."), not that something is missing.
 *
 * `action` is a single node, not a list. Two actions in an empty state is a decision the screen
 * has not made yet.
 *
 * The glyph takes `strokeWidth={1}` — §5's "hairline-stroke" — rather than lucide's default 2,
 * which at 48px reads as a filled icon and makes the empty state the loudest thing on screen.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      data-testid="empty-state"
      className={cn("mx-auto flex max-w-[320px] flex-col items-center gap-4 p-6 text-center", className)}
    >
      <Icon aria-hidden strokeWidth={1} className="size-12 text-ash" />
      <h2 className="text-subheading leading-subheading text-ink">{title}</h2>
      <p className="text-body leading-body text-ash">{children}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
