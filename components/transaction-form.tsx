"use client";

import { useActionState, useMemo, useState } from "react";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTransactionAction, type NewTransactionState } from "@/app/(app)/transactions/new/actions";

export interface WalletOption {
  id: string;
  name: string;
  currencyCode: string;
  isLiability: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
  type: string;
}

const TYPES = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;

export interface TransactionFormInitial {
  transactionType: string;
  amount: string | null;
  walletId: string;
  destinationWalletId: string | null;
  destinationAmount: string | null;
  categoryId: string | null;
  description: string | null;
}
const INITIAL: NewTransactionState = { error: null };

const FIELD =
  "h-11 w-full rounded-card border border-hairline bg-card px-3 text-body text-ink outline-none focus-visible:border-ink";

/*
 * §7 screen 4. The type is a state, not a radio group, so the same screen can grow the transfer branch
 * without a second route: a transfer has no category and needs a destination, and showing those fields
 * disabled is a form that lies about what it needs.
 *
 * Amounts are typed, never computed — the wallet's currency decides the minor unit and the server does the
 * arithmetic. This component does not know what a decimal is.
 *
 * The same component serves the edit screen (Task A). `initial` prefills it, `action` decides where the
 * values go, and nothing about the rules differs: the server re-runs `prepareTransaction` either way, so a
 * pre-filled form is not a form with weaker checks.
 */
export function TransactionForm({
  wallets,
  categories,
  symbols,
  today,
  initial,
  transactionId,
  action = createTransactionAction,
  submitLabel = "Save transaction",
}: {
  wallets: WalletOption[];
  categories: CategoryOption[];
  symbols: Record<string, string>;
  today: string;
  initial?: TransactionFormInitial;
  transactionId?: string;
  action?: typeof createTransactionAction;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  /*
   * `exchange` is not one of the three buttons — the screen has never offered it, and import is the only
   * path that writes it. An `exchange` row being edited still has to submit `exchange`: the balance
   * arithmetic treats the two identically, but the type is a fact about the row the user never asked to
   * change. The transfer branch shows, the transfer button highlights, and the submitted value stays true.
   */
  const [type, setType] = useState<string>(initial?.transactionType ?? "expense");
  const [walletId, setWalletId] = useState(initial?.walletId ?? wallets[0]?.id ?? "");
  const [destinationWalletId, setDestinationWalletId] = useState(initial?.destinationWalletId ?? "");

  const isTransfer = type === "transfer" || type === "exchange";
  const wallet = wallets.find((candidate) => candidate.id === walletId);
  const destination = wallets.find((candidate) => candidate.id === destinationWalletId);
  const crossCurrency = isTransfer && destination !== undefined && wallet !== undefined
    && destination.currencyCode !== wallet.currencyCode;

  const options = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );

  if (wallets.length === 0) {
    return (
      <p className="px-4 py-6 text-body text-ash">
        A wallet is needed before a transaction can be recorded.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 px-4 pb-28 pt-2">
      <input type="hidden" name="type" value={type} />
      {transactionId === undefined ? null : <input type="hidden" name="id" value={transactionId} />}

      <div role="group" aria-label="Transaction type" className="grid grid-cols-3 gap-2">
        {TYPES.map((option) => {
          const selected = option.value === type || (option.value === "transfer" && type === "exchange");
          return (
            <Button
              key={option.value}
              type="button"
              variant={selected ? "primary" : "tertiary"}
              aria-pressed={selected}
              onClick={() => setType(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount</Label>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-body text-ash">
            {wallet === undefined ? "" : (symbols[wallet.currencyCode] ?? wallet.currencyCode)}
          </span>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="1250000"
            defaultValue={initial?.amount ?? ""}
            className="text-subheading tabular-nums"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="walletId">{isTransfer ? "From wallet" : "Wallet"}</Label>
        <select
          id="walletId"
          name="walletId"
          value={walletId}
          onChange={(event) => setWalletId(event.target.value)}
          className={FIELD}
        >
          {wallets.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      {isTransfer ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="destinationWalletId">To wallet</Label>
            <select
              id="destinationWalletId"
              name="destinationWalletId"
              value={destinationWalletId}
              onChange={(event) => setDestinationWalletId(event.target.value)}
              className={FIELD}
            >
              <option value="">Choose a wallet</option>
              {wallets
                .filter((option) => option.id !== walletId)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
            </select>
          </div>

          {crossCurrency || type === "exchange" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="destinationAmount">Amount received</Label>
              <Input
                id="destinationAmount"
                name="destinationAmount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                defaultValue={initial?.destinationAmount ?? ""}
                className="tabular-nums"
              />
              <p className="text-caption text-ash">
                {symbols[destination?.currencyCode ?? ""] ?? destination?.currencyCode} — what lands in the
                destination wallet. A rate is never stored; this is the figure the exchange gave you.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="categoryId">Category</Label>
          <select
            id="categoryId"
            name="categoryId"
            className={FIELD}
            defaultValue={initial?.categoryId ?? ""}
          >
            <option value="">No category</option>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="occurredOn">Date</Label>
        <Input id="occurredOn" name="occurredOn" type="date" defaultValue={today} className="tabular-nums" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          autoComplete="off"
          placeholder="Optional"
          defaultValue={initial?.description ?? ""}
        />
      </div>

      {state.error === null ? null : (
        <p role="alert" data-testid="transaction-form-error" className="text-caption text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className={cn("w-full", pending && "opacity-70")}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
