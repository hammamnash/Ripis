# 002 — Transaction input

One of three screens, not a variant of one (see `001/README.md`).

## What it is

The one place a row enters the ledger. Everything is a picker that opens a Bottom
Sheet — never a native `<select>`, and never a native date input, because the browser
would render `10/04/2026` in whatever order its own locale prefers (§8, ADR-0026).

| Element | Source |
|---|---|
| **Type segmented control** — Expense / Income / Transfer / Exchange | §5 Segmented |
| **Amount field** — 30px tabular, currency code pinned left, separator line | §5 "should feel like a calculator, not a form" |
| **Date** — field opens a month grid, formatted `dd/mm/yyyy` | §8, ADR-0007 |
| **Category** — filtered to the chosen type | FR-04 (an expense with none is refused) |
| **Wallet** / **From → To wallet** | §5 Picker |
| **Amount received** + implied rate, for Exchange only | ADR-0004, FR-06 |
| **Save** — the screen's one highlighter | §5 "highlighter — one per screen, maximum" |

## Design stance

Calculator-first, paperwork-second. The amount is the largest thing on the screen and
the rest reads as a short, ordered checklist under it. Nothing is a free-text field
except the note.

## Interactions

- **Type switch** rebuilds the form: category disappears for Transfer/Exchange, the
  destination and received-amount fields appear, and an Exchange whose destination is
  the same currency silently re-points to a foreign wallet.
- **Typing an amount** groups as you type — `1250000` becomes `1.250.000` — and the
  caret is restored by counting digits, not characters.
- **Category sheet** is searchable and lists only the categories valid for the type:
  Expense → Food, Transport, Shopping, Bills, Entertainment, Health, Education, Other;
  Income → Salary, Bonus, Interest, Refund, Repayment.
- **Exchange** shows the implied rate live, in both directions, and labels it as
  derived for display only — no rate is stored anywhere (ADR-0004).
- **Save** validates (amount > 0, category present, two different wallets) and writes
  the row into `sessionStorage`; 001 pushes it into the ledger on load, so the new row
  appears at the top with every total updated.

## Copy that carries a requirement

The hints are not decoration — each names the rule the field enforces:

- "Required — an expense with no category is refused (FR-04)."
- "Moved between your own wallets — neither income nor expense (FR-05)."
- "A calendar day, not a timestamp (ADR-0007)."

## Known limits

- The amount field is integer-grouped. USD's `minor_unit` of 2 is respected when
  *displaying*, but a USD amount cannot be typed with cents here; a real build needs a
  `minor_unit`-aware input (ADR-0003).
- No receipt attachment, no recurring-rule origin, no split categories.
- Save navigates to 001 after ~800 ms so the result is visible; there is no API and no
  database behind it.
