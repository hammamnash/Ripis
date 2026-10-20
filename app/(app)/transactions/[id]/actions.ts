"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireScreenSession } from "@/src/server/auth/require-screen";
import { runAsCaller } from "@/src/server/context";
import { deleteTransaction } from "@/src/server/transactions/update-transaction";

export async function removeTransaction(formData: FormData) {
  const { caller } = await requireScreenSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await runAsCaller(caller, () => deleteTransaction({ actor: caller, id }));
  revalidatePath("/transactions");
  revalidatePath("/");
  redirect("/transactions");
}
