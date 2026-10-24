import { amountParts, type CurrencyDisplay } from "@/src/lib/display-money";

/*
 * §2.2's second sanctioned use of `--surface-inverted`: the month's Income / Expense / Net band, full-bleed
 * and at `--radius-hero`, sitting directly under the month selector.
 *
 * Four details are the contract, not taste:
 *
 *   full-bleed   the band breaks out of the screen's gutter (`-mx-4`) while the page keeps its `px-4`, so the
 *                band touches both edges and the rows keep their hairline. `.band` does the same thing with
 *                `margin: 0 calc(var(--gutter-mobile) * -1)`.
 *   panel roles  the panel is dark in BOTH themes (§2.9 rule 4), so its labels use `--color-ash-on-panel` and
 *                income uses `--color-positive-on-panel`. `text-ash` / `text-positive` measure 3.35:1 and
 *                2.48:1 here, both under §9's floor.
 *   paper text   the figures are Paper and 17px/450 with the mark at the same size — one weight, one colour,
 *                so the mark is not demoted to a caption on the loudest figure on the screen.
 *   a plain text run, not an `Amount`
 *                Three cells share a phone's width, so a seven-figure total does not fit on one line: the
 *                mockup wraps it between the mark and the digits (`Rp` / `13.217.400`). That break can only
 *                happen if mark and digits are separated by real whitespace, which `Amount`'s inline-flex
 *                deliberately removes. `amountParts` still does the grouping, so no locale escapes here.
 */
export function SummaryBand({
  income,
  expense,
  net,
  currency,
}: {
  income: string;
  expense: string;
  net: string;
  currency: CurrencyDisplay;
}) {
  return (
    <section
      data-slot="summary-band"
      data-testid="summary-band"
      className="-mx-4 grid grid-cols-3 gap-3 rounded-hero bg-panel px-6 py-5 text-paper md:-mx-6"
    >
      <SummaryCell label="Income" value={income} currency={currency} tone="text-positive-on-panel" />
      <SummaryCell label="Expense" value={expense} currency={currency} tone="text-paper" divided />
      <SummaryCell label="Net" value={net} currency={currency} tone="text-paper" divided />
    </section>
  );
}

function SummaryCell({
  label,
  value,
  currency,
  tone,
  divided = false,
}: {
  label: string;
  value: string;
  currency: CurrencyDisplay;
  tone: string;
  divided?: boolean;
}) {
  const parts = amountParts(value, currency);
  const text = parts.suffix
    ? `${parts.sign}${parts.digits} ${parts.mark}`
    : `${parts.sign}${parts.mark} ${parts.digits}`;

  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${divided ? "border-l border-ash-on-panel pl-3" : ""}`}>
      <p className="text-micro uppercase tracking-micro text-ash-on-panel">{label}</p>
      <p className={`tabular-nums text-body-lg leading-body-lg font-w450 ${tone}`}>{text}</p>
    </div>
  );
}
