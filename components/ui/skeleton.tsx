import { cn } from "cn"

/*
 * §5 "Skeleton": "`--color-smoke` at 40% opacity on `--surface-wash`, radius matching the target's
 * radius. Shimmer is **not** used — a plain pulse at 200ms matches the flat editorial tone."
 *
 * shadcn ships `bg-accent` here, which globals.css maps onto `--surface-action` — the highlighter,
 * the one colour §5 reserves for a single high-emphasis action per screen. A loading placeholder
 * painted in it would out-shout every real action on the screen.
 *
 * `--color-skeleton` is the semantic name for smoke (identical hex in light, `#423b36` in dark), so
 * `bg-skeleton/40` is the 40% fill. The wash bed underneath belongs to the container: §2.2 lists
 * "skeleton beds" as a level-2 `--surface-wash` use, so a caller that wants the full §5 treatment
 * puts this on `bg-secondary`.
 *
 * The radius is the caller's, because §5 ties it to whatever the skeleton stands in for.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse bg-skeleton/40", className)}
      {...props}
    />
  )
}

export { Skeleton }
