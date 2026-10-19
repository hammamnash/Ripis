import { Prisma } from '@prisma/client';

import { primaryCurrency } from '../currency';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { money } from '../money/amount';
import { value } from '../money/direction';
import { serialiseWallet, type WalletResponse } from '../wallets/serialise';
import type { ReportQuery } from './filter';

/**
 * What the wallets are worth right now (ADR-0025, ADR-0059, Task 7.4a).
 *
 * **Net worth is reported per currency, and nothing is converted.** The aggregate a hero figure wants is
 * `assets − liabilities`, and both halves only mean something inside one currency: a wallet's currency is
 * unconstrained (`create-wallet.ts` checks only that the currency exists) and §5's own examples put a USD
 * account beside rupiah ones, so a single sum would add dollars to rupiahs the moment a second currency
 * holds anything. Neither repair is available — a rate may not be stored (ADR-0004) and §16 forbids
 * converting at read time — so the primary currency's wallets are the hero, every other currency comes back
 * as its own bucket, and the reply carries enough for a screen to say what the hero leaves out. ADR-0059 is
 * the decision and its accepted cost; this module is where it is applied.
 *
 * **The figure is current, and the endpoint refuses to pretend otherwise.** A balance exists only as it is
 * now: a balance "as of 31 October" would have to replay the ledger up to a date, which is the same replay
 * §16 refuses for net-worth trends. So a window or a narrowing is a `400` naming the field rather than a
 * filter quietly ignored — a client that asked for a filtered net worth and got an unfiltered one would
 * have a plausible wrong number and no way to tell.
 *
 * **`current_balance` is read, not recomputed.** It is the stored figure ADR-0025 keeps in one writer, and
 * a summary that rebuilt it by walking every wallet's transactions would be a second arithmetic path for a
 * number that already has one — the shape `test/ledger-invariants.spec.ts` exists to refuse.
 *
 * The sign is never computed here. `value()` is what net worth sees (`−balance` on a liability), and this
 * module only decides which side of the subtraction it lands on.
 */
const SCOPED_DB = db;

export interface CurrencyBucket {
  currencyId: string;
  /** True for exactly one bucket: the caller's primary currency, whose figures the hero repeats. */
  isPrimary: boolean;
  assets: string;
  /** Positive, as the statement prints it: debts are subtracted, never added as negatives. */
  liabilities: string;
  netWorth: string;
  walletCount: number;
}

export interface WalletSummary {
  /** When this was read. A balance is current, so the reply says which instant it is current *as of*. */
  asOf: string;
  /** The primary currency: what `assets`, `liabilities` and `netWorth` are denominated in. */
  currency: string;
  assets: string;
  liabilities: string;
  netWorth: string;
  walletCount: number;
  /** Every currency the ledger holds, the primary one first — what the hero excludes is named, not hidden. */
  currencies: CurrencyBucket[];
  /** Every live wallet, in the shape `GET /wallets` sends, so a card row and a summary cannot disagree. */
  wallets: WalletResponse[];
}

interface Tally {
  assets: Prisma.Decimal;
  liabilities: Prisma.Decimal;
  walletCount: number;
}

export async function walletSummary(query: ReportQuery): Promise<WalletSummary> {
  refuseNarrowings(query);

  const currency = await primaryCurrency();

  const wallets = await SCOPED_DB.wallet.findMany({
    where: {
      // Stated in this file rather than inherited from a filter builder, because the invariants spec reads
      // each module's own text (ADR-0005): a summary that counts a removed wallet is a net worth holding
      // money the user deleted, and nothing about the figure would look wrong.
      deleted_at: null,
    },
    // Active first, then oldest first — the same order `GET /wallets` uses, so the cards do not reorder
    // themselves when a wallet is archived. An archived wallet is still counted: it may still hold money,
    // and "inactive" means out of the pickers rather than out of the ledger (ADR-0059).
    orderBy: [{ active: 'desc' }, { created_at: 'asc' }],
  });

  const tallies = new Map<string, Tally>();

  for (const wallet of wallets) {
    const tally = tallies.get(wallet.currency_id) ?? { assets: zero(), liabilities: zero(), walletCount: 0 };
    const held = value(wallet, wallet.current_balance);

    // `held` is negative on a liability (a card holding 2,000,000 of debt stores 2000000 and is worth
    // −2000000), so subtracting it states the debt as the positive figure the statement prints. A card *in
    // credit* is the same arithmetic read the other way: its `value` is positive, and the credit adds to net
    // worth instead of being clamped to zero.
    if (wallet.is_liability) {
      tally.liabilities = tally.liabilities.minus(held);
    } else {
      tally.assets = tally.assets.plus(held);
    }

    tally.walletCount += 1;
    tallies.set(wallet.currency_id, tally);
  }

  const currencies: CurrencyBucket[] = [...tallies.entries()]
    .map(([currencyId, tally]) => ({
      currencyId,
      isPrimary: currencyId === currency,
      assets: money(tally.assets),
      liabilities: money(tally.liabilities),
      netWorth: money(tally.assets.minus(tally.liabilities)),
      walletCount: tally.walletCount,
    }))
    .sort((left, right) => (left.isPrimary === right.isPrimary ? 0 : left.isPrimary ? -1 : 1));

  // An account whose primary currency holds no wallet at all is a real state — one USD account and a
  // rupiah primary currency is §5's own example — so it answers with zeroes and a bucket that carries the
  // money, rather than borrowing a figure from another currency.
  const primary =
    currencies.find((bucket) => bucket.isPrimary) ??
    ({
      currencyId: currency,
      isPrimary: true,
      assets: zeroText(),
      liabilities: zeroText(),
      netWorth: zeroText(),
      walletCount: 0,
    } satisfies CurrencyBucket);

  return {
    asOf: new Date().toISOString(),
    currency,
    assets: primary.assets,
    liabilities: primary.liabilities,
    netWorth: primary.netWorth,
    walletCount: primary.walletCount,
    currencies,
    wallets: wallets.map(serialiseWallet),
  };
}

/**
 * A wallet summary takes no window and no filter, and says so by name.
 *
 * This is the one report that is not a period. `month`, `from`, `to` and the five narrowings all describe
 * a set of transactions, and there is no such set here — net worth is the sum of five stored columns. The
 * refusal is deliberately the whole query object rather than a list of forbidden names: a field added to
 * `ReportQuery` later is refused by default, so a filtering that quietly stopped working cannot be
 * introduced by omission.
 */
function refuseNarrowings(query: ReportQuery): void {
  const named = Object.entries(query).find(([, text]) => text !== undefined && text !== '');

  if (named === undefined) return;

  const [field] = named;
  throw new ApiError(
    'validation_failed',
    400,
    `A wallet summary is a current figure: ${field} does not narrow it. Read a period with /reports/monthly-summary.`,
    field,
  );
}

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function zeroText(): string {
  return money(zero());
}
