# Ripis — mockups

Three throwaway HTML screens for Ripis, built from the project's own design contract
rather than from taste:

| File | Screen |
|---|---|
| `001-transactions-list/index.html` | The month's ledger — month selector, summary band, filter chips, rows |
| `002-transaction-input/index.html` | The one way a row enters the ledger |
| `003-dashboard/index.html` | Net-worth hero, wallets, budgets, three charts, one insight |
| `index.html` | **The board**: all three, light and dark, side by side |

Open the board first: `start mockups/index.html` (Windows) — or open any screen
standalone. Each screen carries a small grey bar at the top that is **mockup chrome,
not part of the app**: it links the three screens and switches light / dark / auto.
`?theme=light|dark|auto` works on any screen directly.

> Not production code, and not a design proposal to ship. `.ai/03-design.md` is a
> contract, so these files are an *exercise of* it — which is why the README ends with
> the places where exercising it broke something.

## Why three screens and not "2–3 variants"

The sketch method wants 2–3 competing takes on one screen. This brief was the other
thing: three *different* screens of one app, so a per-screen variant spread would have
produced nine files comparing nothing. Instead the files share one token set, one
ledger and one component layer, and the comparison surface is the board (both themes,
three screens, one page). Where the three do take different stances, the difference is
in the composition, not the palette — see the head-to-head at the end.

## How it is built

```
mockups/
├── index.html                  the board (6 iframes)
├── 001-transactions-list/      index.html + README.md
├── 002-transaction-input/      index.html + README.md
├── 003-dashboard/              index.html + README.md
├── _shared/
│   ├── tokens.css              §11 verbatim (light, dark, @theme) + a labelled mockup layer
│   ├── base.css                reset, type roles (§2.3), phone shell, mockup chrome
│   ├── primitives.css          §5 pills, chips, segmented, fields, sheet, toast, date grid
│   ├── surfaces.css            §5 rows, hero, band, wallet, budget bar, charts, insight
│   └── ledger.js               data + every derived figure + the money formatter
├── _checks/
│   ├── contrast.mjs            WCAG audit of the token pairs
│   ├── figures.mjs             prints every number the screens render
│   ├── page-probe.mjs          headless Chrome + CDP probe harness
│   ├── probe-001/002/003.js    per-screen assertions
│   └── verify.mjs              64 assertions across 3 screens × 2 themes
└── README.md
```

The sketch method prefers one self-contained file per variant. Here the project has a
real token contract, so the tokens and the component layer are **shared** instead of
copied per file — duplicating a 200-line token block three ways is how three screens
drift apart. Every screen is still a single file that opens on its own.

**One ledger, three screens.** `_shared/ledger.js` holds the wallets, categories,
budgets and 68 seeded rows, plus every derived figure: balances, net worth, month
totals, spend by category, budget status, the six-month trend. All three screens read
the same functions, so the list's October expense total and the dashboard's pie cannot
disagree — `verify.mjs` asserts they don't. Every colour is `var(--color-…)`; there is
not one hex literal in the markup, so the theme switch is a token swap.

Nothing here replaces the real stack: no Next.js, no API, no database. The seeded
dataset is invented (a personal ledger, October 2026) and is *not* the real export in
`.ai/reference/`, which was not opened.

## What runs

```bash
# every figure the screens render, printed from the ledger
node mockups/_checks/figures.mjs

# the WCAG audit of the token pairs, including the panel pairs the mockups use
node mockups/_checks/contrast.mjs

# 64 assertions: 3 screens × 2 themes in headless Chrome
node mockups/_checks/verify.mjs
```

`verify.mjs` drives Chrome over CDP (its own port, a throwaway profile, killed after)
and asserts the things a reviewer would otherwise eyeball: that the hero equals the
ledger's net worth, that the list's expense total equals the dashboard's pie total,
that rows are 64px, that the `Rp` mark is a real word space from the digits, that no
IDR figure carries a decimal or an English comma, that the inverted panel is *darker*
than the light canvas and *lighter* than the dark one, that all six pie fills are
distinct, and that nothing overflows horizontally at 430px.

## The dataset the screens show

Primary currency IDR. `mockups/_checks/figures.mjs` prints all of this; the numbers
below are copied from its output, not typed by hand.

- **Net worth `Rp 93.686.838`** — assets `Rp 97.868.838` − liabilities `Rp 4.182.000`.
  The card's debt is stored **positive** and subtracted (ADR-0025); the card shows
  `Rp 4.182.000` with a `LIABILITY` badge and no minus sign.
- **October 2026** — 45 rows: income `Rp 21.623.400`, expense `Rp 8.406.000`, net
  `Rp 13.217.400`. Transfers and the exchange are in the list but excluded from income
  and expense (FR-05), and the reconciliation row ("Balance Difference", `Rp 50.000`)
  *is* counted as an expense, marked only by its note (ADR-0017).
- **Budgets, worst first** — Shopping 108% (negative), Bills exactly 100% (warning),
  Food 80.1% (warning, one tenth of a percent over the ramp), Transport 45.6%
  (positive).
- **Multi-currency** — `$ 90,00` on a Wise USD wallet with its frozen base amount
  `Rp 1.404.000`, and `5.000.000 ₫` received against `Rp 3.196.875` sent, whose implied
  rate (1 IDR = 1,5640 VND) is derived for display and never stored (ADR-0004).
- **Trend** — six months, May `Rp 6.850.000` → October `Rp 8.406.000`, with September
  and October recomputed from the rows rather than trusted from the seed table.

## Head-to-head

| | 001 Transactions list | 002 Transaction input | 003 Dashboard |
|---|---|---|---|
| **Stance** | Scan a month fast | Get one row in correctly | State where you stand |
| Density | High — 45 rows, no cards | Low — one column, big targets | Medium — 5 stacked cards |
| Hero surface | Inverted **band** (3 figures) | None | Inverted **hero** (60px figure) |
| Primary action | Row tap → detail sheet; FAB | Save (the highlighter) | None — it reports |
| Accent use | `+` income, filter chips | Highlighter Save button | Second pie slice |
| Numbers per screen | 3 in the band + 90 amounts | 1 typed + 1 derived rate | 1 hero, 8 in cards, 6 charts |
| Weak at | Nothing summarises a *year* | No keyboard/calc pad | Longest scroll; 3 charts is a lot |

**My take:** 003 is the screen that proves the design system works — the inverted
panel, the six-colour rank palette, the status ramp and both themes all land on one
page, and it is the only screen where the highlighter does structural work. 001 is the
one that will be used daily and is the better test of the row spec (64px, hairline,
full-bleed, no card) — 45 rows is where a bad row design becomes obvious. 002 is the
most *constrained* and therefore the least interesting visually, but it is the one
carrying the most requirements per square inch (FR-04, FR-05, FR-06, ADR-0003,
ADR-0004, ADR-0007, ADR-0026) and it is where the date-format trap actually bites.

## Where exercising the contract broke it

Findings, strongest first. Each was found by building the screens or by the checks, not
by re-reading the docs.

### 1. Semantic text on the inverted panel fails AA in the light theme — **[certain]**

`§5` puts `--color-ash` on the hero's label and `--color-positive` / `--color-negative`
on its delta line. The panel is `--surface-inverted`, which in the light theme is
`#1a1919`. Measured against it:

| Token (light) | Value | On `#1a1919` | Need |
|---|---|---|---|
| `--color-ash` | `#6d6c6b` | **3.35:1** | 4.5:1 |
| `--color-positive` | `#16653f` | **2.48:1** | 4.5:1 |
| `--color-negative` | `#a3261c` | **2.38:1** | 4.5:1 |

Both semantic colours are *dark* in the light theme, so on a near-black band they
disappear. §2.9 already solved this shape of problem for text on the highlighter (rule
1: use `#0c0a08` in both themes) but never for the panel.

**What the mockups do** — a labelled mockup layer in `tokens.css`, no new hexes: on
`--surface-inverted` use the *dark theme's* values, which are the same in both themes.

```css
--color-ash-on-panel: #9e9891;       /* 6.14:1 on #1a1919 · 5.52:1 on #262220 */
--color-positive-on-panel: #66d19b;  /* 9.32:1 · 8.38:1 */
--color-negative-on-panel: #ff9d95;  /* 8.78:1 · 7.89:1 */
```

**Suggested fix:** add these three to §11 and a **§2.9 rule 4** — "on the inverted
panel the semantic colours are the dark-set values, in both themes". One rule, one
value set, nothing invented. ADR only if you consider the choice expensive to reverse.

### 2. Two source-of-truth lines are truncated **on disk and committed** — **[certain]**

Neither was caused by this session; `.ai/` has a clean working tree and both live in
git:

- `.ai/03-design.md:437` — `| 2 | Transactions list | V1 | Month Selector, filter chip row, Transa...[truncated]`
  The screen-inventory row for the *very screen being mocked* is incomplete. The
  mockup inferred the rest from §5 and §7's other rows.
- `.ai/01-prd.md:642` — `` | `category_id` | UUID, FK `Categor...[truncated] `` — the
  budget table's FK cell is cut mid-word.

Both look like a generator that clipped a cell at a width. **Suggested fix:** restore
the two lines by hand and grep the repo for `[truncated]` as a build-time lint, because
a trusted document that silently lies about itself is the exact failure mode `.hermes.md`
warns about.

### 3. The net-worth hero overflows past ~Rp 1,2 miliar, and §5 gives no rule — **[certain]**

`§5` fixes the figure at 60px. Measured at a 430px viewport (382px of usable width):

| Figure | Result |
|---|---|
| `Rp 93.686.838` | fits (382px) |
| `Rp 1.234.567.890` | fits (382px) |
| `Rp 12.345.678.900` | **overflows** (389px > 382px) |

For a personal ledger this is a when, not an if. The mockup adds an autofit that steps
60px down to a 34px floor and never wraps or abbreviates — `verify.mjs` proves it
leaves a fitting figure at 60px and drops the overflowing string to 59px. **Suggested
fix:** one line in §5 naming the floor, so every implementation shrinks the same way
instead of three of them abbreviating to "Rp 12,3 M".

### 4. "Second-largest slice gets the highlighter" is only true in dark — **[certain]**

§4 states the rule, and in the same section states that `#e4f222` **cannot** be reused
as a chart field in the light theme (1.23:1 on the canvas). §11 resolves it silently:
light `--color-chart-2` is olive `#7d8c22`, dark `--color-chart-2` is `#e4f222`.
Verified: light slice 2 renders `rgb(125,140,34)`, dark renders `rgb(228,242,34)`.

So the "signature chart moment" is a **dark-theme** signature; in light it is an olive
slice. Worth one sentence in §4 rather than leaving it to whoever reads the token table
carefully. No code fix — the mockup gets it right for free by using the token.

### 5. "Six slices plus Other" and luminance-as-rank cannot both hold — **[likely]**

With 8 expense categories the tail groups into `Other` at `Rp 715.000` (8.5%), which is
*larger* than two of the five named slices (`Bills` 5.9%, `Transport` 8.1% is larger,
`Bills` smaller). The palette is presented as ordered by luminance, i.e. by size, and
`Other` sits last in sienna — so the visual "bigger = earlier colour" signal inverts.
The mockup keeps `Other` in slot 6 regardless and names its members in the label
(`Other (Entertainment, Health, Other)`). **Options:** a 7th neutral token for `Other`,
or a sentence in §4 saying `Other` always takes slot 6 whatever its size. Related: with
the highlighter off-limits (finding 4) there are only 5 usable category colours for 8
categories, so user-chosen category colours must repeat — which is probably fine, but
it is the counter-argument to ADR-0030's per-category colour.

### 6. A reconciliation has nowhere to file itself — **[certain]**

ADR-0017 makes a reconciliation an ordinary `expense` or `income` row noted
`Balance Difference`, and FR-04 refuses an expense with **no** category. So a
reconciliation must be filed under some user category it does not belong to. The mockup
files it under `Other` and relies on the note, which is consistent with both documents
but means the category chart carries a slice that is not spending. **Suggested fix:**
one clause in ADR-0017 or FR-04.

### 7. The dashboard's multi-currency total needs a rate the app may not store — **[certain]**

The hero's assets and liabilities must be in `IDR`, while a Wise USD and a Cash VND
wallet hold other currencies. ADR-0004 forbids storing a rate, and ADR-0011 leaves no
worker, no queue and no rate source. So: **what number goes into the hero for a foreign
wallet, and where does it come from?**

The mockup converts at one derived display rate (USD `15.600`, VND `0,639375`, the
latter straight from the seeded exchange's implied rate) and says so in the hero's own
footnote, so the screen never claims a precision it does not have. That is honest but
it is a decision, not a derivation. I would take a fourth option:

> **(a) derive each foreign balance from the ledger itself** — every row already freezes
> `base_amount`, so a wallet's primary-currency value is recoverable by summing those
> deltas with no rate stored anywhere, plus an explicit "as of" date and a footnote.
> That satisfies ADR-0004 literally, needs no external source, and is auditable.

**This is the biggest genuinely open question the mockups exposed**, and the only one I
would want an ADR for before any dashboard code is written.

### 8. Smaller doc-precision items — **[certain]**

- **§5's budget-bar label example is written in English grouping** (`1,240,000 of
  2,000,000`) and the PRD's budget table with it, while ADR-0026 makes Indonesian
  figures binding for the UI. The mockup renders `Rp 2.403.000 of Rp 3.000.000`.
  `decisions.md` outranks §5, so no behaviour change — but the example should be
  rewritten or it will be copied literally. Same class of thing: `Rp 1.250.000` is
  correct, `Rp 1,250,000` is a defect.
- **§12 lists "pie vs ranked bars" as open** while PRD §Charts says pie. The PRD wins,
  so the mockup builds a donut with a **directly labelled list** under it — which also
  serves as the §9 text alternative, and as the start of a ranked-bars answer if §12
  ever flips.
- **ADR-0030 (category colours are user-chosen) vs §4 (chart colours are by rank).**
  Both hold at once — chips use the category's colour, the chart uses rank — but a
  category's chip colour then differs from its slice colour. One sentence in §4 would
  stop an implementer "fixing" one into the other.
- **`--color-chart-*` is not in the dark block's `@theme` section** the way the other
  semantics are; the dark values appear in the `[data-theme="dark"]` block. Verified as
  working — the mockups read the tokens and the theme switch recoloured every chart —
  but if the `@theme` block is what Tailwind consumes, confirm the mapping is intended.

## What the mockups deliberately do *not* do

- No Next.js, no NestJS, no Prisma, no API, no database. Nothing here is a scaffold.
- `.ai/reference/`'s real 9,174-row export was **not** opened or copied; the dataset is
  invented. No real account numbers appear anywhere.
- No `adjustment` type (ADR-0017), no `parent_id` on categories (ADR-0014), no
  household/sharing (ADR-0020), no Redis or queue (ADR-0011), no rate stored (ADR-0004),
  no negative liability balance (ADR-0025), no self-signup (ADR-0013).
- `.ai/` was **not** edited. The findings above are proposals; changing the contract is
  your call, not a mockup's.

## If a direction is picked

These files are disposable — the sketch method's own rule is that a sketch worth keeping
gets promoted into project code, not curated. The promotion path, in order:

1. Settle the findings above that need decisions (at minimum #1 and #7).
2. `tokens.css`'s §11 blocks become the real `globals.css`, with the mockup layer folded
   into §11 if #1 is accepted.
3. `_shared/` splits along the app's real boundary: `ledger.js`'s derived figures are
   **NestJS services**, not client code (§0's standing rule — a screen that needs a
   derived figure asks the API). What stays client-side is the formatter and the
   formatters' tests.
4. Each screen becomes one Next.js route; the row, hero, wallet card, budget bar and
   chart components become the first entries in the component library, each carrying its
   §5 citation.
5. `verify.mjs`'s assertions move into the repo's test suite — the cross-screen
   arithmetic ones especially, since "the dashboard total equals the sum of the rows" is
   the failure that matters most and the one an eyeball review cannot catch.
