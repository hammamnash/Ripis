import { Fab } from "@/components/shell/fab";
import { TabBar } from "@/components/shell/tab-bar";
import { Toaster } from "@/components/ui/sonner";
import { connection } from "next/server";

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
 * §6's frame. The shell is the three fixed things — tab bar, FAB, toasts — plus the scroll the
 * screens live in; the header belongs to the screen (`ShellHeader`), because in the App Router a
 * layout cannot read the page's props and a header that guessed the title would be a second source
 * of truth for something every screen already knows.
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
 * There is no session guard here, deliberately, and Task 7.4g closes it. Doors (screen 14) does not
 * exist yet, so a redirect would have nowhere to go, and the geometry suite could not measure a
 * single screen without a database and a login. The shell is presentational; the guard lands with
 * the screen that can receive it.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await connection();

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+32px)]">
        {children}
      </main>

      <TabBar />
      <Fab />
      <Toaster />
    </div>
  );
}
