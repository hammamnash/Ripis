import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SignInForm } from "@/components/sign-in-form";
import { readScreenSession } from "../../../src/server/auth/require-screen";

/*
 * Screen 14, the sign-in half (§7), and the app's front door for anyone without a session.
 *
 * It sits outside the `(app)` group on purpose: the group's frame renders the tab bar and the FAB, and both
 * are meaningless to someone who is not signed in — a tab bar a user can tap their way through before
 * authenticating is a bug with a nice border radius.
 *
 * A signed-in browser is sent to the ledger rather than shown the form, so `/sign-in` behaves the same
 * however it is reached: the entry point to the app, not a second screen inside it.
 */

export const metadata = { title: "Sign in · Ripis" };

/* `dynamic = "force-dynamic"` would be the obvious way to say this, and `next.config.ts` has `cacheComponents`
   on, which forbids it. `connection()` is the sanctioned equivalent and the one the frame already uses: it
   declares request-time access, so Next stops attempting a prerender pass that could only end in a clock
   warning. */
export const instant = false;

export default async function SignInPage() {
  await connection();

  if ((await readScreenSession()) !== null) redirect("/");

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto flex w-full max-w-[360px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          {/* §2.3: serif is reserved for display figures and screen titles, and this is the title of
              the one screen that has no header to carry it. */}
          <h1 className="font-serif text-heading leading-heading tracking-tight text-foreground">Ripis</h1>
          <p className="text-body text-muted-foreground">Sign in to open your ledger.</p>
        </div>

        <SignInForm />
      </div>
    </main>
  );
}
