"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/* The stored theme is only knowable after hydration: `next-themes` reads `localStorage`, so `theme` is
   `undefined` on the server and on the first client render. Comparing it straight into `variant`/`aria-pressed`
   made the two disagree — the server HTML pressed "System", the hydrated tree pressed the stored theme — and
   React reported a hydration mismatch rather than patching it up.

   `useSyncExternalStore` is how a component asks "am I running on the client yet?" without a `mounted` flag set
   from an effect (which this repo's lint rejects as a cascading render): the server snapshot is `false`, the
   client snapshot is `true`, and React re-renders with the client value once hydration settles. `subscribe`
   never fires because nothing external is changing. */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** Settings control for the three theme states required by §2.9. */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return (
    <section aria-labelledby="appearance-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="appearance-heading" className="text-subheading text-ink">Appearance</h2>
        <p className="text-caption text-ash">Choose how Ripis follows light and dark mode.</p>
      </div>
      <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = mounted && theme === value;
          return (
            <Button
              key={value}
              type="button"
              variant={selected ? "primary" : "tertiary"}
              aria-pressed={selected}
              onClick={() => setTheme(value)}
              className="min-h-11 px-3 text-caption"
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
