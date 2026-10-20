"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { createTransaction } from "@/src/server/transactions/create-transaction";

export interface NewTransactionState {
  error: string | null;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/*
 * One place decides what "plain decimal" means: the field takes digits and an optional point, and the
 * Indonesian grouping §-26 puts on screen is a display concern that never reaches this side. A comma is
 * accepted as the decimal mark because that is what a phone keyboard offers here.
 */
function decimal(form: FormData, key: string): string | null | "invalid" {
  const raw = text(form, key).replace(/,/g, ".");
  if (raw === "") return null;
  return /^\d+(\.\d{1,4})?$/.test(raw) ? raw : "invalid";
}

export async function createTransactionAction(
  _previous: NewTransactionState,
  form: FormData,
): Promise<NewTransactionState> {
  const { caller } = await requireScreenSession();

  const amount = decimal(form, "amount");
  if (amount === "invalid") return { error: "Amount must be digits only, e.g. 1250000" };
  if (amount === null) return { error: "An amount is required" };

  const destinationAmount = decimal(form, "destinationAmount");
  if (destinationAmount === "invalid") return { error: "Destination amount must be digits only" };

  try {
    await runAsCaller(caller, () =>
      createTransaction({
        actor: caller,
        transactionType: text(form, "type"),
        occurredOn: text(form, "occurredOn"),
        walletId: text(form, "walletId"),
        destinationWalletId: text(form, "destinationWalletId") || null,
        categoryId: text(form, "categoryId") || null,
        amount,
        destinationAmount: destinationAmount ?? null,
        description: text(form, "description") || null,
      }),
    );
  } catch (error) {
    /* The module's own message is the useful one — "that wallet is archived", "a transfer needs two
       different wallets". Rewriting it here would lose the sentence the person can act on. */
    return { error: error instanceof Error ? error.message : "Could not save the transaction" };
  }

  revalidatePath("/transactions");

  /* Outside the try: `redirect` signals by throwing, and catching it would turn a successful save into an
     error message on the form. */
  redirect("/transactions");
}
