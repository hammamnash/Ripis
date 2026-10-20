"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { updateTransaction } from "@/src/server/transactions/update-transaction";

export interface EditTransactionState {
  error: string | null;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/* Same rule as the create action: digits with an optional point, comma accepted as the decimal mark.
   The edit path re-runs every create rule server-side (`prepareTransaction`), so a row can never be
   edited into a shape that could not have been created. */
function decimal(form: FormData, key: string): string | null | "invalid" {
  const raw = text(form, key).replace(/,/g, ".");
  if (raw === "") return null;
  return /^\d+(\.\d{1,4})?$/.test(raw) ? raw : "invalid";
}

export async function editTransactionAction(
  _previous: EditTransactionState,
  form: FormData,
): Promise<EditTransactionState> {
  const { caller } = await requireScreenSession();

  const id = text(form, "id");
  if (!id) return { error: "No transaction to edit." };

  const amount = decimal(form, "amount");
  if (amount === "invalid") return { error: "Amount must be digits only, e.g. 1250000" };
  if (amount === null) return { error: "An amount is required" };

  const destinationAmount = decimal(form, "destinationAmount");
  if (destinationAmount === "invalid") return { error: "Destination amount must be digits only" };

  const type = text(form, "type");
  const categoryId = text(form, "categoryId");

  if ((type === "expense" || type === "income") && categoryId === "") {
    return { error: "Pick a category — an expense or an income belongs to one" };
  }

  try {
    await runAsCaller(caller, () =>
      updateTransaction({
        actor: caller,
        id,
        edit: {
          transactionType: type,
          occurredOn: text(form, "occurredOn"),
          walletId: text(form, "walletId"),
          destinationWalletId: text(form, "destinationWalletId") || null,
          categoryId: categoryId || null,
          amount,
          destinationAmount: destinationAmount ?? null,
          description: text(form, "description") || null,
        },
      }),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the transaction" };
  }

  revalidatePath("/transactions");
  revalidatePath("/");

  /* Outside the try: `redirect` signals by throwing, and catching it would turn a saved edit into an
     error message on the form. */
  redirect(`/transactions/${id}`);
}
