# 003 — Dashboard

One of three screens, not a variant of one (see `001/README.md`).

## What it is

The answer to "where do I stand". Composition follows §7 row 1: Net Worth Hero,
Wallet Cards, Budget Bars, Chart Cards, one Insight Card — in that order, and no more
than one insight.

| Element | Source |
|---|---|
| **Net-worth hero** — label, figure, delta, asset/liability split | §5 (signature component), §2.9 rule 3 |
| **Wallet cards** — 3 largest assets + the liability | §5 Wallet Card |
| **Budget bars** — worst first, all four statuses | §5 Budget Bar, FR-10 |
| **Spending by category** — donut + labelled list | PRD §Charts; §4 palette by rank |
| **Spending trend** — 6-month line | §4 "ink stroke, 1.5px, no fill" |
| **Net cash flow** — 6-month bars | §4 "bars: single series uses ink" |
| **One insight card** | §5 Insight Card, max 1 |

## Design stance

Statement first, evidence underneath. One heavy panel states the number; everything
below it is a calm, ordered series of cards that explain it. The three charts are
deliberately three different shapes because they answer three different questions —
*what*, *how it is trending*, *whether it is sustainable*.

## Theme behaviour worth looking at

Both themes ship, and the hero is where §2.9 rule 3 is easiest to see:

| | Canvas | Hero panel |
|---|---|---|
| Light | `#f4f2f0` paper | `#1a1919` obsidian — **darker** than the canvas |
| Dark | `#14120f` | `#262220` — **lighter** than the canvas |

The component is written against `--surface-inverted`, so that flip is one token, not a
branch. `verify.mjs` asserts both.

## Interactions

- **Month selector** — hero and wallet balances are month-independent (a balance is a
  balance), while the budgets, charts and insight follow the selected month. Watching
  the hero stay still while September's numbers replace October's is the point.
- **Budget bars** — hover the bars, read the four statuses: 108% negative, 100% warning
  (the exact-100 boundary), 80.1% warning (0.1% over the 80% line), 45.6% positive.
- **Chart cards** — "Last 6 months →" is a link, not a tab bar; long spans belong on a
  Reports screen.
- **Insight card** — one per screen. Its sentence is computed from the same ledger the
  charts read, so it cannot drift from them.

## Known limits

- Only one insight is shown, and it is hard-coded to Food; a real build picks the
  largest deviation.
- Income by category (a PRD chart) is not here — it belongs on Reports, and this screen
  is capped at one insight and three charts.
- Net Worth Trend is deferred by the PRD itself (needs `balance_snapshot`).
- Wallet balances are converted to IDR at one derived display rate; see the "open
  question" section of the top-level README — this is the mockup's biggest gap.
