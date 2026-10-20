import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

/* §2.3: Inter runs everything; Source Serif 4 appears only on display KPI figures and screen
   titles. Both are free and variable, and both load through next/font (which self-hosts them).
   The generated family names are handed to globals.css as --font-inter / --font-source-serif,
   where the §11 tokens consume them — see ADR-0036. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ripis",
  description: "One private, multi-currency ledger.",
};

/* §6 bottoms the shell on `env(safe-area-inset-bottom)`, and that variable is ZERO everywhere until
   the page opts into the full screen with `viewport-fit=cover`. Without this export the tab bar's
   safe-area term silently resolves to 0 and the last 34px of the bar sit under the home indicator on
   the one device family whose inset is not zero — a bug no desktop viewport reproduces. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* §2.9 wants dark to follow the OS by default with a manual override that beats it. The override is
   a `data-theme` attribute on <html>, written before first paint by ThemeProvider's inline script
   (Task 7.3.1 — the comment that stood here called it 7.5, which was wrong). `suppressHydrationWarning`
   is required, and only on this element: the script mutates the attribute before React hydrates, so
   the server and client markup are expected to disagree about it. It suppresses that one attribute
   diff, not any other mismatch below it. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
