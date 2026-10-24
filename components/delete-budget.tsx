"use client";

import { useActionState } from "react";

import { cn } from "cn";

import { deleteBudgetAction, type DeleteBudgetState } from "@/app/(app)/budgets/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const INITIAL: DeleteBudgetState = { error: null };

/*
 * Removing a budget, behind the confirmation sheet §5 reserves for exactly this (FR-10).
 *
 * The confirmation is not a nicety here: `deleteBudget` is a **hard** delete — the row is gone and the
 * unique key `(user_id, category_id, month)` is free again, which is the point of it — so there is no
 * tombstone to undo. §5's undo-toast pattern needs a row to restore; this needs a question first.
 *
 * The copy says what survives, because that is the part a person hesitates over: the spending already
 * recorded against the category is untouched. Only the limit goes.
 */
export function DeleteBudget({ id, month, categoryName }: { id: string; month: string; categoryName: string }) {
  const [state, formAction, pending] = useActionState(deleteBudgetAction, INITIAL);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="destructive" className="w-full">
          Delete budget
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom">
        <span aria-hidden className="mx-auto h-1 w-9 rounded-pill bg-hairline" />

        <SheetHeader>
          <SheetTitle>Delete this budget?</SheetTitle>
          <SheetDescription>
            The limit for {categoryName} is removed. Spending you have already recorded is not touched, and
            the category can be budgeted for this month again.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="month" value={month} />

          {state.error === null ? null : (
            <p role="alert" data-testid="budget-delete-error" className="text-caption text-destructive">
              {state.error}
            </p>
          )}

          <SheetFooter>
            <Button type="submit" variant="destructive" disabled={pending} className={cn(pending && "opacity-70")}>
              {pending ? "Deleting…" : "Delete budget"}
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="tertiary">
                Keep it
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
