import type { Metadata } from "next";
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
