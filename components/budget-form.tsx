"use client";

import { useActionState } from "react";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { monthLabel } from "@/components/month-selector";
import { createBudgetAction, type BudgetFormState } from "@/app/(app)/budgets/actions";
import type { CurrencyDisplay } from "@/src/lib/display-money";

export interface BudgetCategoryOption {
  id: string;
  name: string;
  color: string;
}

const INITIAL: BudgetFormState = { error: null };

/* §5's select: the same control the transaction form uses, so the two screens pick a category the same
   way. The bottom-sheet picker §5 prefers is one shared primitive away; two different pickers on two
   screens would be worse than one plain one on both. */
const SELECT =
  "h-12 w-full rounded-input border border-hairline bg-card px-3 text-body-lg text-ink transition-colors focus-visible:border-foreground";

/*
 * §7 screen 9's form, for a new budget and for changing an existing one (FR-10).
 *
 * **The month is not a field.** It is what the screen is scoped to, passed in from the budgets list's own
 * month selector — so the budget you create is always the month you were looking at, and there is no
 * second place that decides which month it is.
 *
 * **There is no currency picker.** A budget is a limit in the account's primary currency, which is
 * permanent (ADR-0015), so the mark beside the figure is displayed rather than chosen.
 *
 * **In edit mode the category is text, not a control.** A budget's category and month *are* its identity —
 * the unique key — so "changing" either would be a different budget. `updateBudget` refuses them
 * server-side; the screen does not offer them.
 */
export function BudgetForm({
  mode,
  month,
  categories = [],
  currency,
  initial,
  action,
}: {
  mode: "create" | "edit";
  /** `yyyy-mm`. */
  month: string;
  /** What the create screen may offer. Unused when editing: a budget's category is its identity. */
  categories?: BudgetCategoryOption[];
  currency: CurrencyDisplay;
  initial?: { id: string; amount: string; categoryName: string; categoryColor: string };
  /** Required rather than defaulted: create and update are different acts, and a default would let the
      edit screen submit a create — which fails on the one field it does not render. */
  action: typeof createBudgetAction;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (mode === "create" && categories.length === 0) {
    return (
      <p data-testid="budget-form-empty" className="text-body text-ash">
        Every expense category already has a budget for {monthLabel(month)}, or none exists to budget
        against yet. Add an expense category first.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="month" value={month} />
      {initial === undefined ? null : <input type="hidden" name="id" value={initial.id} />}

      <p data-testid="budget-form-month" className="text-caption text-ash">
        For {monthLabel(month)}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="categoryId">Category</Label>
        {initial === undefined ? (
          <select
            id="categoryId"
            name="categoryId"
            defaultValue=""
            className={SELECT}
            required
            /* The offered list is the key: an uncontrolled field keeps a user's entry through the dirty-value
               flag even when `defaultValue` changes, and this form object survives a client-side navigation
               back to a screen it has been used on. Changing the options is the moment a stale pick stops
               being one of the choices — after a create, the category just budgeted is gone from the list. */
            key={categories.map((category) => category.id).join(",") || "none"}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        ) : (
          <p data-testid="budget-category" className="flex items-center gap-2 text-body-lg text-ink">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-pill"
              style={{ backgroundColor: initial.categoryColor }}
            />
            {initial.categoryName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount">Monthly limit</Label>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-body-lg text-ash">
            {currency.symbol}
          </span>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="2000000"
            defaultValue={initial?.amount ?? ""}
            /* Keyed on what the server last stored, so a new stored value remounts the field: an uncontrolled
               input that has been typed in ignores a changed `defaultValue`, which is how an edit came back
               showing the figure that was just replaced. */
            key={initial?.amount ?? "new"}
            className="h-14 text-heading tabular-nums"
          />
        </div>
        <p className="text-caption text-ash">
          A limit in {currency.symbol}, the currency this ledger reports in.
        </p>
      </div>

      {state.error === null ? null : (
        <p role="alert" data-testid="budget-form-error" className="text-caption text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className={cn("w-full", pending && "opacity-70")}>
        {pending ? "Saving…" : mode === "create" ? "Save budget" : "Save changes"}
      </Button>
    </form>
  );
}
