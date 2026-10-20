import { describe, expect, it } from "vitest";
import { monthLabel, shiftMonth } from "../month-selector";

/*
 * Task 7.3 — the month arithmetic, in node, because it is the one part of §5's Month Selector that a
 * browser test proves only for the boundary it happens to click. Everything here is string maths on
 * `yyyy-mm`: no `Date`, so no timezone can move a month (ADR-0007).
 */
describe("shiftMonth", () => {
  it("steps backwards across a year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("steps forwards across a year boundary", () => {
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("keeps a zero-padded month in both directions", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
  });

  it("handles a delta larger than a year, which is where `%` goes negative", () => {
    /* `-13` from January: the intermediate index is negative, and a plain `% 12` would yield month
       "-1" and produce "2024-00". This is the assertion that catches that. */
    expect(shiftMonth("2026-01", -13)).toBe("2024-12");
    expect(shiftMonth("2026-01", 25)).toBe("2028-02");
  });

  it("is its own inverse over a decade", () => {
    for (let year = 2020; year <= 2030; year++) {
      for (let month = 1; month <= 12; month++) {
        const start = `${year}-${String(month).padStart(2, "0")}`;
        expect(shiftMonth(shiftMonth(start, 1), -1), start).toBe(start);
      }
    }
  });

  it("refuses anything that is not yyyy-mm rather than guessing", () => {
    for (const bad of ["2026-1", "202601", "", "2026-01-01", "October 2026"]) {
      expect(() => shiftMonth(bad, 1), bad).toThrow();
    }
  });

  it("rolls an out-of-range month forward instead of rejecting it", () => {
    /* `2026-13` passes the shape check but is not a month, so this normalises rather than throws.
       Rejecting it is the PAGE's job — `/transactions` validates `?month=` against
       `^\d{4}-(0[1-9]|1[0-2])$` before this is ever called — and that division of labour is worth
       pinning: a silent 2027-01 here would look like a bug if the page were the one trusting it. */
    expect(shiftMonth("2026-13", 0)).toBe("2027-01");
  });
});

describe("monthLabel", () => {
  it("renders an English month and a four-digit year (§2.4)", () => {
    expect(monthLabel("2026-01")).toBe("January 2026");
    expect(monthLabel("2025-12")).toBe("December 2025");
  });

  it("throws on a month outside 1-12 instead of returning undefined", () => {
    expect(() => monthLabel("2026-13")).toThrow();
    expect(() => monthLabel("2026-00")).toThrow();
  });
});
