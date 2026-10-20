/**
 * Turning a stored amount into the four pieces §5's Amount Display is built from.
 *
 * The rule that makes this a module rather than a template string: **an amount's sign is composed at the
 * render site and never stored** (§5, ADR-0026). The figure on the wire is a magnitude — an expense is
 * positive, a liability is positive, a pasted-in "−5.000" is refused long before here — so the direction
 * lives in the row's type or in the wallet's role, and this function is where the two meet.
 *
 * Everything is done on strings and `BigInt`. A rupiah ledger reaches ten digits before it is interesting,
 * and `Number` quietly stops being able to add one to the last of them past 2^53; `1.000.000.000.001` is a
 * wealth figure, not an input this app may round. `BigInt` keeps the arithmetic exact and the rounding at
 * the digit the currency actually has (§5: IDR shows 0 decimals, USD shows 2, and `.00` on IDR is a defect).
 *
 * Grouping is Indonesian — `.` between thousands, `,` before the decimals — because the amounts are. An
 * English comma in a figure is a defect, not a locale preference (§5).
 */

/** What the renderer needs to know about a currency. A subset of the row, so a test can hand one in. */
export interface CurrencyDisplay {
  /** How the mark is drawn: `Rp`, `$`, `₫`. */
  symbol: string;
  /** A suffix currency keeps its mark after the digits — `5.000.000 ₫` (§5). */
  suffix: boolean;
  /** Decimal places: 0 for IDR and VND, 2 for USD. */
  minorUnit: number;
}

/** A `+` for money in, a true minus for money out, an arrow for money moved, nothing for a bare figure. */
export type AmountDirection = 'income' | 'expense' | 'transfer' | 'none';

export interface AmountParts {
  /** `+`, `−` (U+2212) or `→`, or empty. Never merged into `digits` (§5 order is sign, mark, digits). */
  sign: string;
  /** The currency mark, or empty for a currency with no symbol. */
  mark: string;
  /** Grouped magnitude, rounded to the currency's own minor unit, and never carrying a sign. */
  digits: string;
  /** Where the mark goes. The view needs this as a fact, not as a guess from the symbol's width. */
  suffix: boolean;
}

/** U+2212. A hyphen is a different character and §5 names it as the wrong one. */
export const MINUS = '\u2212';
export const PLUS = '+';
export const ARROW = '\u2192';

const SIGNS: Record<Exclude<AmountDirection, 'none'>, string> = {
  income: PLUS,
  expense: MINUS,
  transfer: ARROW,
};

/** `1.250.000`: groups of three, separated by a period, applied right to left. */
function group(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }

  return out;
}

/**
 * Round half away from zero at `minorUnit`, and regroup.
 *
 * The digit that decides is the first one being dropped, so the rounding never looks at a digit that is
 * itself the product of rounding — the failure mode that makes `1.005` render as `1,00` in float land. It is
 * half *away from zero* rather than half-up because the magnitude is always positive by the time it gets
 * here; `-1.005` never reaches this function, only `1.005` and a direction.
 */
function round(whole: string, fraction: string, minorUnit: number): { whole: string; fraction: string } {
  const kept = fraction.slice(0, minorUnit).padEnd(minorUnit, '0');
  const decides = fraction.charAt(minorUnit);
  const scale = 10n ** BigInt(minorUnit);

  let minor = BigInt(whole) * scale + BigInt(kept === '' ? '0' : kept);
  if (decides !== '' && decides >= '5') minor += 1n;

  const wholePart = (minor / scale).toString();
  const fractionPart = minorUnit === 0 ? '' : (minor % scale).toString().padStart(minorUnit, '0');

  return { whole: wholePart, fraction: fractionPart };
}

/**
 * The four pieces, for one figure.
 *
 * `value` is a decimal string as the API sends it (`money()`'s 4-decimal form is fine — the extra places are
 * dropped by rounding, not by slicing).
 */
export function amountParts(
  value: string,
  currency: CurrencyDisplay,
  direction: AmountDirection = 'none',
): AmountParts {
  const raw = value.trim();
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw.startsWith('+') ? raw.slice(1) : raw;

  const [wholeRaw = '0', fractionRaw = ''] = unsigned.split('.');

  if (!/^\d+$/.test(wholeRaw) || !/^\d*$/.test(fractionRaw)) {
    throw new Error(`Not a decimal amount: ${JSON.stringify(value)}`);
  }

  const { whole, fraction } = round(wholeRaw, fractionRaw, currency.minorUnit);
  const digits = group(whole) + (fraction === '' ? '' : `,${fraction}`);

  // A direction always wins, and a stored negative that arrives without one is still a negative — dropping
  // its sign would turn a credit balance into a plausible wrong number.
  const sign = direction === 'none' ? (negative ? MINUS : '') : SIGNS[direction];

  return { sign, mark: currency.symbol, digits, suffix: currency.suffix };
}

/**
 * `45%`, `104%`, `99,5%` — a budget's percentage as a person reads it.
 *
 * The API's `percent` is two decimal places for comparison (`budgetStanding`), and two decimals on a bar
 * label is noise: `100.00%` is the same fact as `100%` with two characters of doubt in it. Trailing zeros
 * go, a comma replaces the point, and nothing is rounded away that changes the verdict — the status word
 * beside it is computed from the unrounded comparison.
 */
export function percentText(percent: string): string {
  const trimmed = percent.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a decimal percentage: ${JSON.stringify(percent)}`);
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ''] = unsigned.split('.');
  const kept = fraction.replace(/0+$/, '');

  return `${negative ? MINUS : ''}${whole}${kept === '' ? '' : `,${kept}`}%`;
}
