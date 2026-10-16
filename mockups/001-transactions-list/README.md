# 001 — Transactions list

Not a variant: this is **one of three screens** the brief asked for, not a competing
take on a single screen. The three files are a coherent slice of the same app, so the
sketch skill's "2–3 variants, one axis" rule is inapplicable here — the comparison
surface is the `mockups/index.html` board, which shows all three in both themes.

## What it is

The month's ledger. Composition follows `03-design.md` §7 row 2 and the amounts,
rows and band follow §5:

| Element | Source |
|---|---|
| Sticky header + **month selector** | §6, §5 |
| **Month summary band** — Income / Expense / Net | §2.2's second sanctioned use of `--surface-inverted` |
| **Filter chip row** with counts | §5 Chip |
| **Transaction rows**, 64px, hairline-divided, no card | §5 Transaction Row |
| FAB → 002 | §6 (56px ink circle, 16px above the tab bar) |

## Design stance

Density-first and quiet: the money is the only loud thing on the screen. One inverted
band, then 45 rows of hairline-separated content with no cards, no shadows and no
chrome. A month of spending is meant to be scanned, not browsed.

## Interactions

- **Month selector** — October ↔ September; the whole screen recomputes (band, counts,
  rows). Forward is disabled at the current month rather than hidden.
- **Filter chips** — All / Expense / Income / Transfer, with live counts, filtering
  instantly client-side (a server-side search would debounce ~300 ms; this is a list of
  the caller's own rows already in memory).
- **Row tap** — detail sheet: date, type, category, wallet, amount, frozen base amount,
  note, tags, `recorded_at`, and for an exchange the implied rate plus its ADR-0004
  warning.
- **Swipe left** — a 72px Edit / Delete reveal (§6).
- **Long-press** — context menu (Edit / Duplicate / Delete).
- **Delete** — removes the row and offers Undo; the copy names ADR-0005 soft delete.
- **Empty state** — reachable by filtering a month with no rows of that type (§5).

## Amount rules visible on this screen

- `Rp 1.250.000` — Indonesian grouping. `$ 90,00` keeps USD's two decimals; VND renders
  as `5.000.000 ₫`. No figure carries an English comma or a trailing `.00` on IDR.
- Income gets a leading `+` in `--color-positive`; expense is unprefixed ink; a transfer
  or exchange is ash with `→`.
- An exchange also shows the received amount beneath the sent one (`→ 5.000.000 ₫`).

## Known limits

- Row taps open a **sheet**, not a separate 004 detail screen — the brief asked for
  three screens.
- Edit/Duplicate toast instead of navigating: the rows are seeded, not a real store.
- No pagination or search; 45 rows is one month of the mockup's dataset.
- A row added in **002** persists in `sessionStorage` and appears here (see the
  top-level README); nothing else is mutable.
