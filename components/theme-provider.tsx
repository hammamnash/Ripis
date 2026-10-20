"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/* §2.9: both themes ship, dark follows the OS by default, and a manual choice must beat the OS.
   prefers-color-scheme alone cannot express that (globals.css:33), so the attribute is written by a
   script that runs before first paint — next-themes injects exactly that script, and re-writes the
   attribute on every change. The three states are `system` / `light` / `dark`; the control that sets
   them is Settings (7.4g), not the shell.

   Three props carry decisions, not defaults:
   - attribute="data-theme" — globals.css keys both blocks on `:root[data-theme="dark"]`, never on a
     `.dark` class (ADR-0036). A `class` here would theme nothing and fail silently.
   - enableColorScheme={false} — `color-scheme` is declared per theme block in globals.css:155,211.
     next-themes would also write it as an inline style on <html>, which wins over the stylesheet and
     makes the token file a second, weaker source for the same fact.
   - disableTransitionOnChange — a theme flip must not animate every colour on the page. §2.7's
     transitions are per-component affordances, not a page-wide wash; both harnesses caught the smear
     before this prop existed. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey="ripis-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
