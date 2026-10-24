"use client";

import { useActionState, useMemo, useState } from "react";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";

import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconcileWalletAction, type ReconcileState } from "@/app/(app)/wallets/[id]/actions";
import { reconcilePreview } from "@/src/lib/reconcile-preview";
import type { CurrencyDisplay } from "@/src/lib/display-money";

export interface ReconcileCategory {
  id: string;
  name: string;
  type: string;
}

const INITIAL: ReconcileState = { error: null };

const FIELD =
  "h-11 w-full rounded-card border border-hairline bg-card px-3 text-body text-ink outline-none focus-visible:border-ink";

/*
 * §7 screen 8, composed into the wallet detail (screen 7 lists "reconciliation" as part of that
 * screen). Three fields, and one of them is not an input: the difference is calculated.
 *
 * The preview is the screen's whole argument for existing. A user typing a statement figure cannot
 * know whether the correction will be an income or an expense — on a credit card the obvious answer
 * is wrong (ADR-0025) — so the screen shows the direction it derived and the row it will file before
 * the button is pressed. `reconcilePreview` runs the same value-space projection server-side does,
 * on strings, so what is promised here is what gets filed.
 *
 * The category picker follows the derived direction rather than offering everything, because the
 * filed row's type is not a choice: an expense category cannot file a correction the ledger decided
 * is an income, and Postgres would refuse it with a sentence about the row, not about the pick.
 *
 * **The panel arrives folded.** Reconciling is a correction, not the reason anyone opens a wallet, so the
 * fields sit behind a native `<details>` disclosure — the same one the dashboard's sections use — with the
 * recorded figure still on the summary line, because "what does the ledger say" is the question every
 * reconciliation starts from. A failed submit re-opens it: an error message inside a closed panel is an
 * error nobody reads.
 */
export function ReconcileForm({
  walletId,
  walletName,
  isLiability,
  recordedBalance,
  currency,
  categories,
  today,
}: {
  walletId: string;
  walletName: string;
  isLiability: boolean;
  recordedBalance: string;
  currency: CurrencyDisplay;
  categories: ReconcileCategory[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(reconcileWalletAction, INITIAL);

  const [actualBalance, setActualBalance] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const preview = useMemo(
    () => reconcilePreview({ isLiability, recordedBalance, actualBalance }),
    [isLiability, recordedBalance, actualBalance],
  );

  const filing = preview !== null && preview.direction !== "match";
  const options = useMemo(
    () => (preview === null || preview.direction === "match"
      ? []
      : categories.filter((category) => category.type === preview.direction)),
    [categories, preview],
  );

  /* A pick made under one direction is not a pick under the other, and silently carrying it across
     would produce the mismatch error the picker exists to prevent. */
  const selected = options.some((category) => category.id === categoryId) ? categoryId : "";

  return (
    <details
      data-slot="reconcile-panel"
      className="group rounded-[16px] border border-hairline bg-card px-4 py-3"
      /* An error filed while the panel is shut would be filed out of sight. */
      open={state.error === null ? undefined : true}
    >
      <summary
        data-testid="reconcile-toggle"
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden"
      >
        <h2 className="flex items-center gap-1.5 text-body text-ink">
          Reconcile {walletName}
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-ash motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
          />
        </h2>
        <span className="flex items-baseline gap-2 text-caption text-ash">
          <span>Ledger says</span>
          <Amount value={recordedBalance} currency={currency} className="text-body text-ink" />
        </span>
      </summary>

      <form action={formAction} className="flex flex-col gap-4 pt-2">
        <input type="hidden" name="walletId" value={walletId} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="actualBalance">Balance on your statement</Label>
          <Input
            id="actualBalance"
            name="actualBalance"
            inputMode="decimal"
            autoComplete="off"
            placeholder="1250000"
            value={actualBalance}
            onChange={(event) => setActualBalance(event.target.value)}
            className="tabular-nums"
          />
          {isLiability ? (
            <p className="text-caption text-ash">
              State the debt the way the statement states it. A card owing less than the ledger thinks is
              money you have gained.
            </p>
          ) : null}
        </div>

        {preview === null ? (
          <p className="text-caption text-ash">Type the figure to see the difference.</p>
        ) : preview.direction === "match" ? (
          <p className="text-caption text-ash">
            That is the balance the ledger already holds, so there is nothing to reconcile.
          </p>
        ) : (
          <div data-testid="reconcile-preview" className="flex flex-col gap-1 rounded-card bg-canvas px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-caption text-ash">Difference</span>
              <Amount value={preview.difference} currency={currency} className="text-body text-ink" />
            </div>
            <p className="text-caption text-ash">
              Files an{" "}
              <span data-testid="reconcile-direction">{preview.direction}</span> of{" "}
              <Amount value={preview.amount} currency={currency} className="text-ink" /> noted{" "}
              <span className="text-ink">Balance Difference</span>.
            </p>
          </div>
        )}

        {filing ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="categoryId">Category</Label>
            <select
              id="categoryId"
              name="categoryId"
              value={selected}
              onChange={(event) => setCategoryId(event.target.value)}
              className={FIELD}
            >
              <option value="">Choose a {preview?.direction} category</option>
              {options.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="occurredOn">Date</Label>
          <Input id="occurredOn" name="occurredOn" type="date" defaultValue={today} className="tabular-nums" />
        </div>

        {state.error === null ? null : (
          <p role="alert" data-testid="reconcile-error" className="text-caption text-destructive">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending || !filing || selected === ""}
          className={cn("w-full", pending && "opacity-70")}
        >
          {pending ? "Reconciling…" : "Reconcile wallet"}
        </Button>
      </form>
    </details>
  );
}
