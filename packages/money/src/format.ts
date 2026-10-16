/**
 * The one currency-aware formatter (FR-03, ADR-0026, `03-design.md` §5).
 *
 * Every amount the product renders goes through here. Two things it is not:
 * it is not a calculator (it decides no value — the API does), and it is not
 * plural (a second formatter is a defect: figures would drift apart screen by
 * screen, and IDR would grow a `.00` in whichever copy forgot `minor_unit`).
 *
 * The display contract, from `03-design.md` §5 Amount Display:
 *   - Order is fixed: sign, then currency mark, then digits —
 *     `+Rp 1.250.000`, `−Rp 1.250.000`. Never `Rp -1.250.000`.
 *   - A suffix currency keeps its mark after the digits, sign still leading —
 *     `5.000.000 ₫`.
 *   - `−` is U+2212, not a hyphen. Income leads with `+`, transfer with `→`.
 *   - Grouping is Indonesian: `.` groups thousands, `,` decimal.
 *   - Rounding happens once, here, at the currency's `minor_unit`.
 */

import { roundHalfUp } from "./round";

/** `Currency` row shape. Passed in by the caller — never re-declared at a call site. */
export interface CurrencyMeta {
  code: string;
  symbol: string;
  minor_unit: number;
  /** VND's mark follows the digits. Currency data, not a formatter special case. */
  suffix: boolean;
}

/**
 * The direction a figure leads with. Composed at the render site and never
 * stored: an amount has no direction until something says what it means.
 */
export type Direction = "income" | "expense" | "transfer" | "none";

const TRUE_MINUS = "\u2212";
const ARROW = "\u2192";

/**
 * Group the integer part in threes with a dot — Indonesian grouping (ADR-0026).
 * English grouping is the inverse and is the single most common way to render
 * one-and-a-quarter million as one-and-a-quarter thousand.
 */
export function group(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [intPart = "0", fraction] = unsigned.split(".");

  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = fraction === undefined ? grouped : `${grouped},${fraction}`;

  return negative ? `-${body}` : body;
}

/** Digits with the mark in its correct place: `Rp 1.250.000` or `5.000.000 ₫`. */
function placeMark(digits: string, currency: CurrencyMeta): string {
  return currency.suffix ? `${digits} ${currency.symbol}` : `${currency.symbol} ${digits}`;
}

/**
 * The unsigned figure, signed only when the value itself is negative.
 * An amount with no direction carries no sign.
 */
export function formatAmount(value: string, currency: CurrencyMeta): string {
  const rounded = roundHalfUp(value, currency.minor_unit);
  const negative = rounded.startsWith("-");
  const digits = group(negative ? rounded.slice(1) : rounded);

  return (negative ? TRUE_MINUS : "") + placeMark(digits, currency);
}

/**
 * The same figure with its direction glyph. `+Rp 1.250.000` for income,
 * `→Rp 1.250.000` for a transfer, nothing for an expense.
 *
 * A value that is negative leads with `−` whatever the direction says: the
 * direction describes what the row means, the minus describes which way the
 * balance moved, and a negative income is a contradiction worth seeing rather
 * than hiding. Transaction amounts are positive by `CHECK (amount > 0)`, so
 * this only ever shows up on a balance or a net worth.
 */
export function formatAmountWithDirection(
  value: string,
  currency: CurrencyMeta,
  direction: Direction,
): string {
  const rounded = roundHalfUp(value, currency.minor_unit);
  const negative = rounded.startsWith("-");
  const digits = group(negative ? rounded.slice(1) : rounded);

  const lead = negative
    ? TRUE_MINUS
    : direction === "income"
      ? "+"
      : direction === "transfer"
        ? ARROW
        : "";

  return lead + placeMark(digits, currency);
}

/** `dd/mm/yyyy`, no locale switch (ADR-0026). Dates are not locale-sensitive here. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    throw new Error(`formatDate: expected yyyy-mm-dd, got ${isoDate}`);
  }
  return `${day}/${month}/${year}`;
}
