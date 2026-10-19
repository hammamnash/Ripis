import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as walletSummary } from '../app/api/reports/wallet-summary/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { POST as archiveWallet } from '../app/api/wallets/[id]/archive/route';
import { DELETE as deleteWallet } from '../app/api/wallets/[id]/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { CURRENCIES, prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * What the wallets are worth right now, through the real endpoint (FR-09, ADR-0025, ADR-0059).
 *
 * This is the figure the dashboard's hero states, and the reason it is asserted here rather than in the
 * mockup is that a wrong net worth does not look wrong: it is a number, formatted the way every other
 * number is. Three of these tests exist to make a specific way of being wrong impossible —
 *
 * - the card is **subtracted**, because a liability's stored balance is positive and the naive sum adds it;
 * - the dollars are **not** added to the rupiah, which is the failure the browser mockup shipped (a second
 *   currency's balance entering the primary total with nothing on screen to say so);
 * - an exchange **does** move the hero, which is ADR-0059's accepted cost, pinned here so that a later
 *   reader finds it as a decision with a reason rather than as a bug to fix.
 *
 * The ledger is built to make each figure checkable by hand: 3,000,000 and 1,000,000 of assets, 2,000,000
 * of debt, and 500 in a currency that must never be counted with them.
 */
const EMAIL = 'phase-7-wallet-summary@ripis.test';
const FOREIGN_EMAIL = 'phase-7-wallet-summary-foreign@ripis.test';

/** TST: two decimals and a leading mark. This ledger's primary currency. */
const PRIMARY = CURRENCIES.base.code;
/** TS0: zero decimals, like IDR in production — the currency that must not be folded into the hero. */
const FOREIGN = CURRENCIES.zeroDecimal.code;

let ledger: SpecLedger;
let foreignLedger: SpecLedger;

let cash: string;
let savings: string;
let wise: string;

interface Bucket {
  currencyId: string;
  isPrimary: boolean;
  assets: string;
  liabilities: string;
  netWorth: string;
  walletCount: number;
}

interface Row {
  id: string;
  name: string;
  currencyId: string;
  currentBalance: string;
  value: string;
  active: boolean;
}

interface Summary {
  status: number;
  data: {
    asOf: string;
    currency: string;
    assets: string;
    liabilities: string;
    netWorth: string;
    walletCount: number;
    currencies: Bucket[];
    wallets: Row[];
  };
  error: { code: string; field?: string };
}

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
  foreignLedger = await signedInLedger(FOREIGN_EMAIL);

  cash = await wallet('Net worth cash', '3000000');
  await wallet('Net worth card', '2000000', { type: 'credit_card', liability: true });
  savings = await wallet('Net worth savings', '1000000');
  wise = await wallet('Net worth wise', '500', { currencyId: FOREIGN });
});

afterAll(async () => {
  await closeLedger(ledger);
  await closeLedger(foreignLedger);
  await teardownTestData();
  await prisma.$disconnect();
});

/** The route's context for a dynamic segment, spelled the way Next hands it over. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function wallet(
  name: string,
  openingBalance: string,
  options: { type?: string; liability?: boolean; currencyId?: string; into?: SpecLedger } = {},
): Promise<string> {
  const target = options.into ?? ledger;

  const response = await createWallet(
    target.request('/api/wallets', {
      method: 'POST',
      body: {
        name,
        walletType: options.type ?? 'cash',
        currencyId: options.currencyId ?? PRIMARY,
        openingBalance,
        ...(options.liability === undefined ? {} : { isLiability: options.liability }),
      },
    }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);

  return ((await response.json()) as { id: string }).id;
}

async function record(body: Record<string, unknown>): Promise<void> {
  const response = await createTransaction(
    ledger.request('/api/transactions', { method: 'POST', body }),
    undefined,
  );

  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
}

/** The reply as the endpoint produced it — a screen reaches these figures through exactly this URL. */
async function summary(query = '', target?: SpecLedger): Promise<Summary> {
  const response = await walletSummary(
    (target ?? ledger).request(`/api/reports/wallet-summary${query}`),
    undefined,
  );

  return { status: response.status, ...((await response.json()) as object) } as never;
}

const bucket = (data: Summary['data'], currencyId: string): Bucket =>
  data.currencies.find((entry) => entry.currencyId === currencyId) as Bucket;

const row = (data: Summary['data'], name: string): Row =>
  data.wallets.find((entry) => entry.name === name) as Row;

describe('Task 7.4a — net worth is stated per currency, and nothing is converted', () => {
  it('subtracts the card rather than adding it, and sends every figure as a string', async () => {
    const { status, data } = await summary();

    expect(status).toBe(200);
    expect(data.currency).toBe(PRIMARY);

    // 3,000,000 + 1,000,000 of assets, against 2,000,000 of debt stated positive.
    expect(data.assets).toBe('4000000.0000');
    expect(data.liabilities).toBe('2000000.0000');
    expect(data.netWorth).toBe('2000000.0000');
    expect(data.walletCount).toBe(3);

    // The sign lives in `direction.ts` and arrives here through `serialiseWallet`: the stored balance is
    // what the statement says, the value is what net worth sees, and both are on the wire (ADR-0025).
    expect(row(data, 'Net worth card').currentBalance).toBe('2000000.0000');
    expect(row(data, 'Net worth card').value).toBe('-2000000.0000');

    // A balance is a current figure, so the reply says which instant it is current as of.
    expect(Number.isNaN(Date.parse(data.asOf))).toBe(false);

    for (const figure of [data.assets, data.liabilities, data.netWorth]) {
      expect(typeof figure).toBe('string');
    }
  });

  it('gives the other currency its own bucket, and keeps it out of the hero', async () => {
    const { data } = await summary();

    expect(data.currencies.map((entry) => entry.currencyId)).toEqual([PRIMARY, FOREIGN]);
    expect(bucket(data, PRIMARY).isPrimary).toBe(true);

    expect(bucket(data, FOREIGN).netWorth).toBe('500.0000');
    expect(bucket(data, FOREIGN).isPrimary).toBe(false);
    expect(bucket(data, FOREIGN).walletCount).toBe(1);

    // 500 in a currency with no stored rate cannot become rupiah (ADR-0004, §16) — and at 1:1 it would be
    // invisible. The hero reports the primary currency's own wallets and the bucket is how a screen says
    // what the hero leaves out (ADR-0059).
    expect(data.netWorth).toBe('2000000.0000');
    expect(JSON.stringify(bucket(data, FOREIGN))).not.toContain('2000500');
  });

  it('moves net worth by zero when a transfer stays inside one currency', async () => {
    const before = (await summary()).data;

    await record({
      transactionType: 'transfer',
      occurredOn: '2026-10-12',
      walletId: cash,
      destinationWalletId: savings,
      amount: '250000.0000',
    });

    const after = (await summary()).data;

    expect(after.assets).toBe(before.assets);
    expect(after.liabilities).toBe(before.liabilities);
    expect(after.netWorth).toBe(before.netWorth);

    // The two wallet rows did move, in opposite directions and by the same amount.
    expect(row(after, 'Net worth cash').value).toBe('2750000.0000');
    expect(row(after, 'Net worth savings').value).toBe('1250000.0000');
  });

  it('lowers the hero by the amount that left, and raises the bucket in the currency that arrived', async () => {
    const before = (await summary()).data;

    await record({
      transactionType: 'exchange',
      occurredOn: '2026-10-13',
      walletId: cash,
      destinationWalletId: wise,
      amount: '500000.0000',
      destinationAmount: '30.0000',
      baseAmount: '500000.0000',
    });

    const after = (await summary()).data;

    // The accepted cost of ADR-0059, asserted rather than discovered: money that leaves a primary-currency
    // wallet is no longer in the hero, and the 30 that arrived are 30 of a different currency, so nothing
    // here pretends the exchange was free. What makes it acceptable is that the figure only ever *falls*
    // by money the user can see leaving, and the bucket that gained it is in the same reply.
    expect(after.assets).toBe('3500000.0000');
    expect(after.netWorth).toBe('1500000.0000');
    expect(bucket(after, FOREIGN).netWorth).toBe('530.0000');

    expect(before.netWorth).toBe('2000000.0000');
  });

  it('keeps an archived wallet in the total, because archiving takes it out of the pickers only', async () => {
    const before = (await summary()).data;

    const archived = await archiveWallet(
      ledger.request(`/api/wallets/${wise}/archive`, { method: 'POST' }),
      ctx(wise),
    );
    expect(archived.status).toBe(200);

    const after = (await summary()).data;

    expect(after.netWorth).toBe(before.netWorth);
    expect(bucket(after, FOREIGN).netWorth).toBe('530.0000');
    expect(row(after, 'Net worth wise').active).toBe(false);
  });

  it('drops a soft-deleted wallet, and the money standing on it, from the total', async () => {
    const deleted = await deleteWallet(
      ledger.request(`/api/wallets/${savings}`, { method: 'DELETE' }),
      ctx(savings),
    );
    expect(deleted.status).toBe(200);

    const after = (await summary()).data;

    // 2,250,000 of assets left after the exchange, minus the 1,250,000 that was standing in savings. A
    // summary that forgot its `deleted_at IS NULL` would still say 3,500,000 (ADR-0005).
    expect(after.assets).toBe('2250000.0000');
    expect(after.netWorth).toBe('250000.0000');
    expect(after.walletCount).toBe(2);
    expect(after.wallets.map((entry) => entry.name)).not.toContain('Net worth savings');
  });

  it('refuses a window and a narrowing by name instead of filtering silently', async () => {
    const window = await summary('?month=2026-10');
    expect(window.status).toBe(400);
    expect(window.error.code).toBe('validation_failed');
    expect(window.error.field).toBe('month');

    // The same refusal covers a narrowing: there is no set of transactions here for a wallet or a category
    // to select from, so a filtered net worth is not a smaller figure, it is a different question.
    const narrowed = await summary(`?walletId=${cash}`);
    expect(narrowed.status).toBe(400);
    expect(narrowed.error.field).toBe('walletId');

    const ranged = await summary('?from=2026-10-01&to=2026-10-31');
    expect(ranged.status).toBe(400);
    expect(ranged.error.field).toBe('from');

    // And the unread call still answers, so the refusal is about the query and not about the endpoint.
    expect((await summary()).status).toBe(200);
  });

  it('answers zeroes when the primary currency holds no wallet, instead of borrowing another total', async () => {
    await wallet('Foreign primary cash', '1000', { into: foreignLedger });

    // An account's primary currency is set at creation and never editable (ADR-0015), so the one state the
    // API cannot build is reached directly: a ledger whose primary currency holds no wallet at all. It is
    // not hypothetical — §5's own example is a USD account under a rupiah primary currency.
    await prisma.user.update({
      where: { id: foreignLedger.userId },
      data: { primary_currency_id: FOREIGN },
    });

    const { status, data } = await summary('', foreignLedger);

    expect(status).toBe(200);
    expect(data.currency).toBe(FOREIGN);
    expect(data.assets).toBe('0.0000');
    expect(data.liabilities).toBe('0.0000');
    expect(data.netWorth).toBe('0.0000');
    expect(data.walletCount).toBe(0);

    // The 1,000 is still in the reply, in the bucket that owns it and marked as not the primary currency.
    expect(data.currencies).toHaveLength(1);
    expect(bucket(data, PRIMARY).netWorth).toBe('1000.0000');
    expect(bucket(data, PRIMARY).isPrimary).toBe(false);
  });
});
