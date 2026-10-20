/**
 * The reconciliation preview (§7 screen 8: "Actual balance input, calculated difference").
 *
 * `reconcile` derives the correction's direction server-side, and the screen must show the same
 * arithmetic before the user commits — a confirmation that agrees with nothing on screen is not a
 * confirmation. This module is the client's copy of the one rule that makes a liability invert
 * (ADR-0025): the difference a user reads off the statement is stated the way the statement states it
 * (a card's debt is positive), while the income-vs-expense decision lives in **value** space, where
 * a card's figure is negated. On a liability the two therefore carry opposite signs, and showing one
 * while filing the other is the defect this split makes visible instead of silent.
 *
 * It is pure and exact: strings in, strings out, arithmetic on `BigInt` scaled to four decimal
 * places — the same scale as the column. A `Number` here would round a rupiah figure the ledger
 * cannot round (ADR-0012), and the invariant suite says so.
 */

export type ReconciliationPreview = {
  /** Actual minus recorded, in statement terms, 4 dp. What the screen shows as "the difference". */
  difference: string;
  /** The row the server will file. `match` means there is nothing to reconcile. */
  direction: 'income' | 'expense' | 'match';
  /** Magnitude of the gap, 4 dp — the figure the filed row carries. */
  amount: string;
};

/** Digits with an optional leading minus and up to four decimal places — the column's own shape. */
const DECIMAL = /^-?\d{1,15}(\.\d{1,4})?$/;

/** `"-50.25"` → `-502500n` at scale 10^4. Input is regex-checked before this runs. */
function scaled(text: string): bigint {
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const minor = BigInt(whole) * 10_000n + BigInt((fraction + '0000').slice(0, 4));
  return negative ? -minor : minor;
}

/** The inverse of `scaled`, to exactly four decimal places. */
function unscaled(minor: bigint): string {
  const negative = minor < 0n;
  const absolute = (negative ? -minor : minor).toString().padStart(5, '0');
  return `${negative ? '-' : ''}${absolute.slice(0, -4)}.${absolute.slice(-4)}`;
}

/**
 * Preview one reconcile against the figure the wallet detail page shows.
 *
 * `recordedBalance` is `WalletResponse.currentBalance` — statement terms, the number on screen — so
 * the preview never reads the stored column itself and never needs the sign of a liability flipped
 * twice. `actualBalance` is the statement figure the user typed, stated the way the statement states
 * it, exactly as `reconcile` takes it.
 *
 * The value-space gap is `actual − recorded` on an asset and `recorded − actual` on a liability:
 * debt that fell is net worth that rose. That single negation is the whole inversion, and it is the
 * same projection `src/server/money/direction.ts` makes server-side.
 *
 * Returns `null` when the typed text is not yet a number the column could hold — the screen shows no
 * difference for a half-typed figure rather than a wrong one.
 */
export function reconcilePreview(input: {
  isLiability: boolean;
  recordedBalance: string;
  actualBalance: string;
}): ReconciliationPreview | null {
  const raw = input.actualBalance.trim().replace(/,/g, '.');
  if (!DECIMAL.test(raw) || !DECIMAL.test(input.recordedBalance.trim())) return null;

  const actual = scaled(raw);
  const recorded = scaled(input.recordedBalance.trim());

  const valueGap = input.isLiability ? recorded - actual : actual - recorded;

  return {
    difference: unscaled(actual - recorded),
    direction: valueGap === 0n ? 'match' : valueGap > 0n ? 'income' : 'expense',
    amount: unscaled(valueGap < 0n ? -valueGap : valueGap),
  };
}
