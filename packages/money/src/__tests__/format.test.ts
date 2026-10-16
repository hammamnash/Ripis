import { describe, expect, it } from "vitest";

import { formatAmount, formatAmountWithDirection, formatDate, group } from "../format";
import { roundHalfUp } from "../round";
import type { CurrencyMeta } from "../format";

/**
 * The acceptance criteria of FR-03: "An IDR transaction renders `Rp 1.250.000`,
 * never `Rp 1.250.000,00`."
 *
 * Figures are asserted as exact strings, not with `toContain`. The minus is
 * U+2212 and the arrow is U+2192 — a hyphen passes a contains-check and is
 * still the wrong glyph on screen.
 */

const IDR: CurrencyMeta = { code: "IDR", symbol: "Rp", minor_unit: 0, suffix: false };
const VND: CurrencyMeta = { code: "VND", symbol: "\u20ab", minor_unit: 0, suffix: true };
const USD: CurrencyMeta = { code: "USD", symbol: "$", minor_unit: 2, suffix: false };
const SGD: CurrencyMeta = { code: "SGD", symbol: "S$", minor_unit: 2, suffix: false };
const EUR: CurrencyMeta = { code: "EUR", symbol: "\u20ac", minor_unit: 2, suffix: false };
const JPY: CurrencyMeta = { code: "JPY", symbol: "\u00a5", minor_unit: 0, suffix: false };

describe("formatAmount", () => {
  it("renders IDR with Indonesian grouping and no decimals", () => {
    expect(formatAmount("1250000", IDR)).toBe("Rp 1.250.000");
    // never "Rp 1.250.000,00"
    expect(formatAmount("1250000.0000", IDR)).toBe("Rp 1.250.000");
  });

  it("renders every currency in §4's table as that table says it renders", () => {
    expect(formatAmount("1250000", IDR)).toBe("Rp 1.250.000");
    expect(formatAmount("5000000", VND)).toBe("5.000.000 \u20ab");
    expect(formatAmount("1250", USD)).toBe("$ 1.250,00");
    expect(formatAmount("1250", SGD)).toBe("S$ 1.250,00");
    expect(formatAmount("1250", EUR)).toBe("\u20ac 1.250,00");
    expect(formatAmount("125000", JPY)).toBe("\u00a5 125.000");
  });

  it("renders 2-decimal currencies with a comma decimal", () => {
    expect(formatAmount("1250", USD)).toBe("$ 1.250,00");
  });

  it("groups the major units in threes, not in English thousands", () => {
    // 1.250.000 is one-and-a-quarter million. "1,250,000" would be the inverse.
    expect(formatAmount("1250000", IDR)).toBe("Rp 1.250.000");
    expect(formatAmount("999", IDR)).toBe("Rp 999");
    expect(formatAmount("1000", IDR)).toBe("Rp 1.000");
  });

  it("leads a negative figure with a true minus, outside the mark", () => {
    expect(formatAmount("-1250000", IDR)).toBe("\u2212Rp 1.250.000");
    expect(formatAmount("-1250", USD)).toBe("\u2212$ 1.250,00");
    // a suffix currency keeps the mark last, sign still leading
    expect(formatAmount("-5000000", VND)).toBe("\u22125.000.000 \u20ab");
  });

  it("never renders -0", () => {
    expect(formatAmount("-0.4", IDR)).toBe("Rp 0");
    expect(formatAmount("-0.004", USD)).toBe("$ 0,00");
  });

  it("never returns exponential notation at Decimal(19,4) extremes", () => {
    expect(formatAmount("999999999999999.9999", IDR)).toBe("Rp 1.000.000.000.000.000");
    expect(formatAmount("-999999999999999.9999", IDR)).toBe("\u2212Rp 1.000.000.000.000.000");
  });
});

describe("formatAmountWithDirection", () => {
  it("composes the mark at the render site: sign, then mark, then digits", () => {
    expect(formatAmountWithDirection("1250000", IDR, "income")).toBe("+Rp 1.250.000");
    expect(formatAmountWithDirection("1250000", IDR, "expense")).toBe("Rp 1.250.000");
    expect(formatAmountWithDirection("1250000", IDR, "transfer")).toBe("\u2192Rp 1.250.000");
    expect(formatAmountWithDirection("1250000", IDR, "none")).toBe("Rp 1.250.000");
  });

  it("keeps a transfer's arrow ahead of a suffix currency's digits", () => {
    expect(formatAmountWithDirection("5000000", VND, "transfer")).toBe("\u21925.000.000 \u20ab");
  });

  it("lets a negative value lead with the minus whatever the direction says", () => {
    expect(formatAmountWithDirection("-1250000", IDR, "expense")).toBe("\u2212Rp 1.250.000");
  });
});

describe("roundHalfUp", () => {
  it("rounds half-up exactly once, at display", () => {
    expect(roundHalfUp("1250000.5", 0)).toBe("1250001");
    expect(roundHalfUp("0.005", 2)).toBe("0.01");
    expect(roundHalfUp("999.9995", 2)).toBe("1000.00");
  });

  it("is not banker's rounding", () => {
    // A half-even implementation answers 0.02 and 1250000 here.
    expect(roundHalfUp("0.015", 2)).toBe("0.02");
    expect(roundHalfUp("2.5", 0)).toBe("3");
    expect(roundHalfUp("1250000.5", 0)).toBe("1250001");
  });

  it("keeps the sign, and drops it when the value rounds away to zero", () => {
    expect(roundHalfUp("-1250000.5", 0)).toBe("-1250001");
    expect(roundHalfUp("-0.4", 0)).toBe("0");
  });

  it("is idempotent and exact at Decimal(19,4) extremes", () => {
    expect(roundHalfUp("999999999999999.9999", 4)).toBe("999999999999999.9999");
    expect(roundHalfUp("999999999999999.99995", 4)).toBe("1000000000000000.0000");
    expect(roundHalfUp(roundHalfUp("1.005", 2), 2)).toBe("1.01");
  });

  it("refuses anything that is not a plain decimal string", () => {
    // Silently mis-formatting a value we cannot parse is worse than failing.
    expect(() => roundHalfUp("1e21", 0)).toThrow(/not a plain decimal string/);
    expect(() => roundHalfUp("Rp 1.250.000", 0)).toThrow(/not a plain decimal string/);
    expect(() => roundHalfUp("", 0)).toThrow(/not a plain decimal string/);
    expect(() => roundHalfUp("1250000", -1)).toThrow(/non-negative integer/);
  });
});

describe("group", () => {
  it("groups thousands with a dot and keeps a comma decimal", () => {
    expect(group("1250000")).toBe("1.250.000");
    expect(group("1250.00")).toBe("1.250,00");
    expect(group("999")).toBe("999");
  });
});

describe("formatDate", () => {
  it("renders dd/mm/yyyy", () => {
    expect(formatDate("2026-10-16")).toBe("16/10/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });
});
