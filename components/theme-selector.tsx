"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/** Settings control for the three theme states required by §2.9. */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <section aria-labelledby="appearance-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="appearance-heading" className="text-subheading text-ink">Appearance</h2>
        <p className="text-caption text-ash">Choose how Ripis follows light and dark mode.</p>
      </div>
      <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = theme === value;
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
