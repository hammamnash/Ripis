/**
 * Half-up rounding on decimal strings.
 *
 * String arithmetic on purpose. `Number()` on a monetary value is a bug
 * (I1, ADR-0003, ADR-0012): a double loses exactly the digit that decides the
 * rounding, and the failure is silent. At `Decimal(19,4)`'s extremes it is not
 * theoretical — `Number("999999999999999.9999")` rounds the wrong way and
 * `Number("1e21")` comes back in exponential notation.
 *
 * This is arithmetic, so it emits an ASCII hyphen for a negative. The display
 * layer is what turns that into a true minus (U+2212) — see `format.ts`.
 */

/** Digits, an optional sign, an optional fraction. No exponent notation. */
const DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;

export function roundHalfUp(value: string, dp: number): string {
  if (!Number.isInteger(dp) || dp < 0) {
    throw new Error(`roundHalfUp: dp must be a non-negative integer, got ${dp}`);
  }
  if (!DECIMAL.test(value)) {
    throw new Error(`roundHalfUp: not a plain decimal string: ${value}`);
  }

  const negative = value.startsWith("-");
  const unsigned = value.startsWith("-") || value.startsWith("+") ? value.slice(1) : value;
  const [intPart = "0", fraction = ""] = unsigned.split(".");

  // One digit past what we keep decides the round — half-up, never banker's.
  const kept = (fraction + "0".repeat(dp)).slice(0, dp);
  const nextDigit = fraction.charAt(dp) || "0";

  let digits = intPart + kept;
  if (nextDigit >= "5") {
    digits = (BigInt(digits) + 1n).toString().padStart(digits.length, "0");
  }

  const cut = digits.length - dp;
  const rounded = dp === 0 ? digits : `${digits.slice(0, cut)}.${digits.slice(cut)}`;

  // A rounded-away negative is zero, and "-0" is not a figure anyone wants.
  return negative && /[1-9]/.test(digits) ? `-${rounded}` : rounded;
}
