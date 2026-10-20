"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { reconcile } from "@/src/server/reconciliation/reconcile";

export interface ReconcileState {
  error: string | null;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/*
 * A statement figure is the one amount in the app that may arrive negative: a credit card in credit
 * is a negative debt, stated the way the bank states it. `parseAmount` server-side already accepts
 * the sign; this pre-check only keeps a half-typed figure off the wire so the message stays human.
 */
function signedDecimal(form: FormData, key: string): string | null | "invalid" {
  const raw = text(form, key).replace(/,/g, ".");
  if (raw === "") return null;
  return /^-?\d{1,15}(\.\d{1,4})?$/.test(raw) ? raw : "invalid";
}

export async function reconcileWalletAction(
  _previous: ReconcileState,
  form: FormData,
): Promise<ReconcileState> {
  const { caller } = await requireScreenSession();

  const walletId = text(form, "walletId");
  if (!walletId) return { error: "No wallet to reconcile." };

  const actualBalance = signedDecimal(form, "actualBalance");
  if (actualBalance === "invalid") {
    return { error: "The statement figure must be a number, e.g. 1250000" };
  }
  if (actualBalance === null) return { error: "Type the balance the statement shows." };

  const categoryId = text(form, "categoryId");
  /* The row reconcile files is an ordinary income or expense, so Postgres'
     `income_expense_need_category` will refuse a bare correction — say it here, in a sentence. */
  if (categoryId === "") return { error: "Pick a category — a correction belongs to one" };

  try {
    await runAsCaller(caller, () =>
      reconcile({
        actor: caller,
        walletId,
        actualBalance,
        occurredOn: text(form, "occurredOn"),
        categoryId,
      }),
    );
  } catch (error) {
    /* Including `balance_already_matches` and `category_type_mismatch`: the modules' own sentences
       are the actionable ones, and the second is what a stale preview says when the ledger moved
       between page load and submit. */
    return { error: error instanceof Error ? error.message : "Could not reconcile the wallet" };
  }

  revalidatePath("/");
  revalidatePath("/wallets");
  revalidatePath(`/wallets/${walletId}`);

  /* Outside the try: `redirect` signals by throwing, and catching it would turn a filed correction
     into an error message on the form. */
  redirect(`/wallets/${walletId}`);
}
