"use server";

import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { listTransactions } from "@/src/server/transactions/read-transactions";
import { accountKey, PASSWORD_PER_ACCOUNT } from "@/src/server/auth/attempts";
import { changePassword } from "@/src/server/auth/change-password";
import { checkRateLimit } from "@/src/server/rate-limit";

export interface RangeSummary {
  count: number | null;
  error: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/*
 * Screen 12 (§7, Task 7.4f) asks for "a summary of what will be included" before a file is produced.
 * The count is the figure the export itself will select, because it is read through
 * `listTransactions` — the module that owns the range filter. A screen that wrote its own `where`
 * clause would be a second definition of "in range", and the two would drift (ADR-0039).
 */
export async function exportSummaryAction(input: { from: string; to: string }): Promise<RangeSummary> {
  const { caller } = await requireScreenSession();

  if (!DATE.test(input.from) || !DATE.test(input.to)) {
    return { count: null, error: "Both dates must be written YYYY-MM-DD." };
  }

  try {
    const page = await runAsCaller(caller, () =>
      listTransactions({ from: input.from, to: input.to, perPage: 1 }),
    );
    return { count: page.total, error: null };
  } catch (error) {
    /* A real calendar date a person can type into an input — 2026-02-30 — reaches `parseCalendarDate`
       and is refused in a sentence; that sentence is more actionable than a generic failure. */
    return { count: null, error: error instanceof Error ? error.message : "The range could not be read." };
  }
}

export interface PasswordState {
  error: string | null;
  /** True on the submit that actually changed the password, so the form can clear itself. */
  changed: boolean;
}

/*
 * §7 screen 13, "password" — the same act as `POST /api/auth/password`, reached from a form instead
 * of a fetch. The guards are mirrored, not re-invented: the rate limit is the route's own rule keyed
 * on the same account, so a browser that tries the form and the API in turn does not get two budgets
 * (ADR-0044), and `changePassword` keeps its own validation because the sentences it throws are the
 * actionable ones.
 *
 * The session id comes from the cookie's session, never the form: ADR-0045 keeps "the one that made
 * the request" alive, and which session made it is only knowable server-side. A form field naming a
 * session would let one sign-in end another's deliberately.
 */
export async function changePasswordAction(
  _previous: PasswordState,
  form: FormData,
): Promise<PasswordState> {
  const { caller, session } = await requireScreenSession();

  const attempts = checkRateLimit(accountKey("password", caller.id), PASSWORD_PER_ACCOUNT);
  if (!attempts.allowed) {
    return {
      error: `Too many attempts. Try again in ${attempts.retryAfterSeconds} seconds.`,
      changed: false,
    };
  }

  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  if (currentPassword === "" || newPassword === "") {
    return { error: "Fill in both passwords.", changed: false };
  }
  /* The server sees only one new password, so agreement between the two fields is this form's rule
     alone — and a mistyped confirmation that silently wins is the worst outcome a password change has. */
  if (newPassword !== confirmPassword) {
    return { error: "The two new passwords do not match.", changed: false };
  }

  try {
    await runAsCaller(caller, () =>
      changePassword({
        userId: caller.id,
        currentSessionId: session.sessionId,
        currentPassword,
        newPassword,
      }),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The password could not be changed.",
      changed: false,
    };
  }

  return { error: null, changed: true };
}
