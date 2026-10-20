import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { screenSession, type ScreenSession } from './screen-session';
import { SESSION_COOKIE } from './session-cookie';

/**
 * The guard the `(app)` frame runs before it renders anything, and the check the sign-in screen runs to
 * bounce a signed-in browser to the ledger.
 *
 * It lives here rather than in `screen-session.ts` because these two calls — `cookies()` and `redirect()` —
 * are properties of the environment, not of the decision. Keeping them apart is what lets the decision be
 * tested against a real session row without a request scope (Pitfall 1 in the phase skill: a filter one
 * import away is invisible, and so is a guard).
 *
 * **No `?next=` return path.** A layout is not told the pathname in the App Router, so the only destination
 * it could offer is one it guessed — and guessing wrong sends a user who asked for Budgets to the Dashboard.
 * The sign-in screen lands everyone on `/`, which is the ledger's front door and the one screen that is
 * correct for every account. Adding return paths is a small feature with an open-redirect surface; it is not
 * worth inventing one here to skip a tap.
 */

export async function readScreenSession(): Promise<ScreenSession | null> {
  const jar = await cookies();

  return screenSession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireScreenSession(): Promise<ScreenSession> {
  const session = await readScreenSession();

  if (session === null) redirect('/sign-in');

  return session;
}
