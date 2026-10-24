"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireScreenSession } from "@/src/server/auth/require-screen";
import { createBudget } from "@/src/server/budgets/create-budget";
import { deleteBudget } from "@/src/server/budgets/remove-budget";
import { updateBudget } from "@/src/server/budgets/update-budget";
import { runAsCaller } from "@/src/server/context";

/*
 * §7 screen 9's write half (FR-10). The screen has always been able to *read* a month's budgets; these
 * are the three acts that make one exist, change it, and remove it.
 *
 * Nothing here decides what a budget is allowed to be. `createBudget` and `updateBudget` own every rule —
 * a positive amount, an unarchived expense category, one budget per category per month, amount-only
 * edits — and this module only turns a form into their arguments. The messages those modules throw are
 * the actionable ones ("A budget for Groceries already exists for 2026-10."), so they are passed through
 * rather than rewritten: a screen that restated them would be a second definition of the rule, and the
 * two would drift (ADR-0039).
 */

export interface BudgetFormState {
  error: string | null;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/*
 * The figure the field carries, as a plain decimal.
 *
 * `parseAmount` server-side takes a dot or nothing, so the comma an Indonesian keyboard offers is
 * translated here — the same rule the transaction actions apply. This is a *shape* check that keeps a
 * half-typed figure off the wire; whether the number is positive is `parsePositiveAmount`'s call.
 */
function decimal(form: FormData, key: string): string | null | "invalid" {
  const raw = text(form, key).replace(/,/g, ".");
  if (raw === "") return null;
  return /^\d{1,15}(\.\d{1,4})?$/.test(raw) ? raw : "invalid";
}

/** The month the acting screen was showing, so the redirect lands back on it rather than on today's. */
function monthOf(form: FormData): string {
  return text(form, "month").slice(0, 7);
}

export async function createBudgetAction(
  _previous: BudgetFormState,
  form: FormData,
): Promise<BudgetFormState> {
  const { caller } = await requireScreenSession();

  const categoryId = text(form, "categoryId");
  if (categoryId === "") return { error: "Pick a category — a budget is a limit for one." };

  const amount = decimal(form, "amount");
  if (amount === "invalid") return { error: "Amount must be a number, e.g. 2000000" };
  if (amount === null) return { error: "A monthly limit is required" };

  const month = monthOf(form);

  try {
    await runAsCaller(caller, () => createBudget({ actor: caller, categoryId, amount, month }));
  } catch (error) {
    /* Including the 409 for a duplicate: it names the category and the month, which is the one sentence
       that tells the user which budget already exists. */
    return { error: error instanceof Error ? error.message : "Could not save the budget" };
  }

  revalidatePath("/budgets");
  revalidatePath("/");

  /* Outside the try: `redirect` signals by throwing, and catching it would turn a saved budget into an
     error message on the form. */
  redirect(`/budgets?month=${month}`);
}

export async function updateBudgetAction(
  _previous: BudgetFormState,
  form: FormData,
): Promise<BudgetFormState> {
  const { caller } = await requireScreenSession();

  const id = text(form, "id");
  if (id === "") return { error: "No budget to edit." };

  const amount = decimal(form, "amount");
  if (amount === "invalid") return { error: "Amount must be a number, e.g. 2000000" };
  if (amount === null) return { error: "A monthly limit is required" };

  const month = monthOf(form);

  try {
    /* Only `amount` is sent. A budget's category and month are its identity — `updateBudget` refuses
       them rather than moving the row, and the screen shows them as fixed text for the same reason. */
    await runAsCaller(caller, () => updateBudget({ actor: caller, id, body: { amount } }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the budget" };
  }

  revalidatePath("/budgets");
  revalidatePath("/");

  redirect(`/budgets?month=${month}`);
}

export interface DeleteBudgetState {
  error: string | null;
}

export async function deleteBudgetAction(
  _previous: DeleteBudgetState,
  form: FormData,
): Promise<DeleteBudgetState> {
  const { caller } = await requireScreenSession();

  const id = text(form, "id");
  const month = monthOf(form);
  if (id === "") return { error: "No budget to delete." };

  try {
    await runAsCaller(caller, () => deleteBudget({ actor: caller, id }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not delete the budget" };
  }

  revalidatePath("/budgets");
  revalidatePath("/");

  redirect(month === "" ? "/budgets" : `/budgets?month=${month}`);
}
