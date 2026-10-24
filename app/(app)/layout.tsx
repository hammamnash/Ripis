import { Fab } from "@/components/shell/fab";
import { SideRail } from "@/components/shell/side-rail";
import { TabBar } from "@/components/shell/tab-bar";
import { Toaster } from "@/components/ui/sonner";
import { connection } from "next/server";

import { requireScreenSession } from "../../src/server/auth/require-screen";

/* Every screen under this frame reads per-user data, so none of them is prerenderable, and Next 16
   says so twice on the same page:
     - `searchParams` (Transactions' month) is a blocking read: "encountered uncached or runtime data
       during prerendering". Suspense is the right answer for a static shell with one streamed island;
       it is not right for an app whose every screen is a session lookup.
     - `new Date()` (the month default when the query string carries none) is an "unstable value".
   `await connection()` in the layout below settles both by declaring the segment request-time — and
   `connection()` is itself a blocking read, which is why the flag is needed as well: Next's own error
   lists "[block] Set `export const instant = false` to allow a blocking route". Verified both ways —
   with `connection()` alone the build fails on "/". It lives on the FRAME, not on Transactions,
   because 7.4's screens all read the session the same way. */
export const instant = false;

/*
 * §6's frame. The shell is the fixed things — the phone's tab bar, the desktop rail, the FAB, the
 * toasts — plus the scroll the screens live in; the header belongs to the screen (`ShellHeader`),
 * because in the App Router a layout cannot read the page's props and a header that guessed the title
 * would be a second source of truth for something every screen already knows.
 *
 * The navigation is one of two presentations of the same five items, never both: `TabBar` below
 * 768px and `SideRail` from 768px up, where §2.4 also widens the gutter to 24px. The content column
 * is capped by `--content-max` and centred inside whatever the rail leaves, so the frame reads the
 * same on a 430px phone and a 2560px monitor.
 *
 * `min-h-dvh`, not `min-h-screen`: 100vh on mobile Safari is the height *including* the
 * retractable chrome, so a `100vh` shell starts out taller than the viewport and the tab bar sits
 * below the fold until the user scrolls. `dvh` tracks the visual viewport.
 *
 * The bottom padding is the bar plus the safe-area inset plus 32px. Every term is needed: without
 * the bar's height the last row is underneath it, without the inset it is under the home indicator
 * on the one device family that has one, and without the 32px it is flush against the bar with the
 * FAB sitting on top of it (§6's 32px section gap).
 *
 * The guard runs here, once, for all five tabs, and it is the reason this file imports a server module:
 * `requireScreenSession()` resolves the `ripis_session` cookie through `findLiveSession` and redirects to
 * `/sign-in` when there is no live session (Task 7.4). It belongs on the frame rather than on each page
 * because the frame is what renders the tab bar — a signed-out browser must never see a bar it can tap
 * through. Pages that need the caller call the same helper themselves: a layout's return value is not
 * something a page can read, and passing it through React context would put a server-only credential in a
 * client boundary.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await connection();
  await requireScreenSession();

  return (
    <div className="flex min-h-dvh flex-col md:pl-[var(--rail-width)]">
      <SideRail />

      {/* The column is what keeps a 2560px monitor from stretching a 15px label across the room; the
          three widths below 1120px are unaffected, and a phone loses nothing to it. */}
      <main className="flex-1 pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+32px)] md:pb-16">
        <div className="mx-auto w-full max-w-[var(--content-max)]">{children}</div>
      </main>

      <TabBar />
      <Fab />
      <Toaster />
    </div>
  );
}
