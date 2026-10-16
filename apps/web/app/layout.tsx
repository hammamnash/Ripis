import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

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

/* No data-theme is set here yet, so the light block in globals.css applies. §2.9 wants dark to
   follow the OS by default with a manual override that beats it — that needs the Settings
   control and the pre-paint attribute script, which is Task 7.5 (FR-15). The dark block itself
   ships now, and is reachable by setting data-theme="dark" on <html>. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
