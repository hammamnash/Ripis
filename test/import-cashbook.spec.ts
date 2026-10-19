import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as exportCashbookSheet } from '../app/api/export/cashbook/route';
import { POST as importCashbookFile } from '../app/api/import/cashbook/route';
import { POST as createCategory } from '../app/api/categories/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { CASHBOOK_LITERALS, cashbookHeaders } from '../src/server/export/cashbook';
import { xlsxBuffer } from '../src/server/export/file';
import { planCashbook, readCashbook, type CashbookRow, type ParsedCashbook } from '../src/server/import/cashbook';
import { CURRENCIES, prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * The cashbook import (FR-12, Task 6.5) — the half that makes ADR-0008's round trip a guarantee.
 *
 * Task 6.4 shipped a file. This task is the property that file has to have: **export → reimport →
 * identical balances, wallets and totals.** Nothing here reads `.ai/reference/`; the hard shapes are
 * reproduced from the plan's list as a fixture built through the real endpoints, so the test is about the
 * ledger this application writes rather than about somebody else's spreadsheet.
 *
 * The plan's six hard shapes, and where each is asserted:
 *
 * | shape | how it is built here |
 * |---|---|
 * | three cross-currency transfers | five, including one that leaves the primary currency and one that leaves the foreign one |
 * | one instant carrying two pairs | `SAME_INSTANT` — two pairs, four rows, one timestamp |
 * | one instant carrying three pairs | `THREE_PAIRS` — three pairs, six rows, one timestamp |
 * | one instant carrying a pair and an ordinary row | `MIXED_INSTANT` |
 * | a reconciliation | an `expense` noted `Balance Difference …` (ADR-0017), imported verbatim |
 * | a pair whose dates straddle a month boundary | `occurred_on` 31 August, `recorded_at` 3 September |
 *
 * The fixture is **nine transactions and sixteen rows**, not the eight rows the plan's prose names: the six
 * shapes cannot fit in eight rows, because the three cross-currency transfers alone are six. The shapes are
 * what the plan is enumerating, and every one of them is built and asserted below.
 *
 * The strict literals are asserted through the endpoint: a file whose column 7 says `Expense` is refused
 * rather than read as `Exp.`, and the ledger is untouched afterwards — a refusal that had already written
 * half a file would be a worse outcome than the refusal.
 */

/** Zero-based, so `String(value)` in an assertion reads the same way as the column it came from. */
const COLUMN = {
  period: 0,
  accounts: 1,
  category: 2,
  subcategory: 3,
  note: 4,
  primary: 5,
  literal: 6,
  description: 7,
  amount: 8,
  currency: 9,
  accounts2: 10,
} as const;

const TST = CURRENCIES.base.code;
const TS0 = CURRENCIES.zeroDecimal.code;

const AUGUST = { startDate: '2026-08-01', endDate: '2026-08-31' };
const THROUGH_SEPTEMBER = { startDate: '2026-08-01', endDate: '2026-09-30' };

/** Two pairs share this instant. A timestamp is not a pair key, so both must still find their own partner. */
const SAME_INSTANT = new Date('2026-08-20T01:02:03.000Z');
/** Three pairs share this one — the reference history has five such timestamps. */
const THREE_PAIRS = new Date('2026-08-21T04:05:06.000Z');
/** A pair and an ordinary entry share this one. */
const MIXED_INSTANT = new Date('2026-08-22T07:08:09.000Z');
/** The pair whose `occurred_on` is in August and whose `recorded_at` is in September (§12's own warning). */
const STRADDLED = new Date('2026-09-03T02:03:04.000Z');

interface SheetRow {
  values: ExcelJS.CellValue[];
}

async function sheetOf(response: Response): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as unknown as ExcelJS.Buffer);

  const sheet = workbook.worksheets[0];

  if (sheet === undefined) {
    throw new Error('the export produced no worksheet');
  }

  const rows: SheetRow[] = [];

  for (let index = 1; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const values: ExcelJS.CellValue[] = [];

    for (let column = 1; column <= 11; column += 1) {
      values.push(row.getCell(column).value);
    }

    rows.push({ values });
  }

  return rows;
}

function text(row: SheetRow, column: number): string {
  const value = row.values[column];

  return value === null || value === undefined ? '' : String(value);
}

/** Every data row, its `Period` dropped, sorted — the two files compared as multisets, since equal instants can order either way. */
function dataRowsOf(rows: SheetRow[]): string[][] {
  return rows
    .slice(1)
    .map((row) => row.values.slice(1).map((value) => (value === null || value === undefined ? '' : String(value))))
    .sort();
}

/** A workbook written by hand, for the files this application would never produce. */
async function workbookOf(rows: string[][], primaryCurrency: string = TST): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cashbook');

  sheet.addRow(cashbookHeaders(primaryCurrency));

  for (const row of rows) sheet.addRow(row);

  return (await xlsxBuffer(workbook)).toString('base64');
}

/** A row of the file, as the reader would hand it back. */
function row(over: Partial<CashbookRow> = {}): CashbookRow {
  return {
    row: 2,
    period: SAME_INSTANT,
    accounts: 'Cash TST',
    category: '',
    note: '',
    primaryValue: '0.0000',
    literal: CASHBOOK_LITERALS.expense,
    description: '',
    amount: '0.0000',
    currency: TST,
    accounts2: '0.0000',
    ...over,
  };
}

const parsed = (rows: CashbookRow[], primaryCurrency: string = TST): ParsedCashbook => ({
  primaryCurrency,
  rows,
});

/** One transfer's two rows, as §12 renders them: mirrored names, one shared column 6, one foreign leg. */
function pair(over: {
  from: string;
  to: string;
  primaryValue: string;
  amount: string;
  currency: string;
  fromValue: string;
  toValue: string;
  period?: Date;
  note?: string;
  firstRow?: number;
}): CashbookRow[] {
  const period = over.period ?? SAME_INSTANT;

  return [
    row({
      row: over.firstRow ?? 2,
      period,
      accounts: over.from,
      category: over.to,
      note: over.note ?? '',
      primaryValue: over.primaryValue,
      literal: CASHBOOK_LITERALS.transferOut,
      amount: over.amount,
      currency: over.currency,
      accounts2: over.fromValue,
    }),
    row({
      row: (over.firstRow ?? 2) + 1,
      period,
      accounts: over.to,
      category: over.from,
      note: over.note ?? '',
      primaryValue: over.primaryValue,
      literal: CASHBOOK_LITERALS.transferIn,
      amount: over.amount,
      currency: over.currency,
      accounts2: over.toValue,
    }),
  ];
}

describe('the cashbook import maps a file back to transactions (Task 6.5, FR-12)', () => {
  it('reads amount and currency off the source leg, not off the file’s Amount column', () => {
    // `Cash TST` holds the primary currency, so the file names the leg that arrived (`5000000 TS0`) and puts
    // the source's own figure (`1250000`, which is also column 6) in `Accounts2`. Reading `Amount`/`Currency`
    // into `amount`/`currency_id` would store 5,000,000 TS0 as the *source* amount and look entirely correct.
    const plan = planCashbook(
      parsed(
        pair({
          from: 'Cash TST',
          to: 'Cash TS0',
          primaryValue: '1250000.0000',
          amount: '5000000.0000',
          currency: TS0,
          fromValue: '1250000.0000',
          toValue: '5000000.0000',
        }),
      ),
      TST,
    );

    expect(plan.writes).toEqual([
      {
        transactionType: 'exchange',
        occurredOn: '2026-08-20',
        walletName: 'Cash TST',
        destinationWalletName: 'Cash TS0',
        categoryName: null,
        amount: '1250000.0000',
        destinationAmount: '5000000.0000',
        baseAmount: '1250000.0000',
        description: null,
        notes: null,
      },
    ]);

    expect(plan.wallets).toEqual([
      { name: 'Cash TS0', currencyId: TS0 },
      { name: 'Cash TST', currencyId: TST },
    ]);
  });

  it('reads the destination’s currency when the source is the foreign leg', () => {
    // The reverse direction: `Cash TS0` leaves, `Bank TST` receives. `foreignLeg` names the source whenever
    // the source is not in the primary currency, so `Currency` is `TS0` and the *destination* is the one the
    // column-6 figure identifies.
    const plan = planCashbook(
      parsed(
        pair({
          from: 'Cash TS0',
          to: 'Bank TST',
          primaryValue: '750000.0000',
          amount: '3000000.0000',
          currency: TS0,
          fromValue: '3000000.0000',
          toValue: '750000.0000',
        }),
      ),
      TST,
    );

    expect(plan.wallets).toEqual([
      { name: 'Bank TST', currencyId: TST },
      { name: 'Cash TS0', currencyId: TS0 },
    ]);

    expect(plan.writes[0]).toMatchObject({
      walletName: 'Cash TS0',
      destinationWalletName: 'Bank TST',
      amount: '3000000.0000',
      destinationAmount: '750000.0000',
      baseAmount: '750000.0000',
    });
  });

  it('writes a same-currency transfer as a transfer, with no second amount', () => {
    const plan = planCashbook(
      parsed(
        pair({
          from: 'Cash TST',
          to: 'Bank TST',
          primaryValue: '300000.0000',
          amount: '300000.0000',
          currency: TST,
          fromValue: '300000.0000',
          toValue: '300000.0000',
        }),
      ),
      TST,
    );

    // `prepare.ts` refuses a `destinationAmount` when both wallets hold one currency, so the file's demand for
    // one has to be dropped rather than passed on.
    expect(plan.writes[0]).toMatchObject({ transactionType: 'transfer', destinationAmount: null });
    expect(plan.wallets).toEqual([
      { name: 'Bank TST', currencyId: TST },
      { name: 'Cash TST', currencyId: TST },
    ]);
  });

  it('pairs two transfers that share an instant by their counterparties, not by the instant', () => {
    // Four rows, one timestamp, the *same* two wallets in both directions. A matcher keyed on the instant
    // would give each out-row whichever in-row it met first and swap the amounts between the two transfers —
    // and the ledger it built would still balance, which is why this is asserted rather than reasoned about.
    const plan = planCashbook(
      parsed([
        ...pair({
          from: 'Cash TST',
          to: 'Cash TS0',
          primaryValue: '100000.0000',
          amount: '400000.0000',
          currency: TS0,
          fromValue: '100000.0000',
          toValue: '400000.0000',
          firstRow: 2,
        }),
        ...pair({
          from: 'Cash TST',
          to: 'Cash TS0',
          primaryValue: '250000.0000',
          amount: '1000000.0000',
          currency: TS0,
          fromValue: '250000.0000',
          toValue: '1000000.0000',
          firstRow: 4,
        }),
      ]),
      TST,
    );

    expect(plan.writes.map((write) => [write.amount, write.destinationAmount, write.baseAmount])).toEqual([
      ['100000.0000', '400000.0000', '100000.0000'],
      ['250000.0000', '1000000.0000', '250000.0000'],
    ]);
  });

  it('refuses a pair whose wallet currencies cannot be read from the file', () => {
    // Neither leg is in the primary currency: `foreignLeg` names the source and the destination's currency is
    // nowhere in the pair. Guessing here would file money under the wrong currency, so the wallet is named.
    expect(() =>
      planCashbook(
        parsed(
          [
            ...pair({
              from: 'US Cash',
              to: 'Cash VND',
              primaryValue: '1500000.0000',
              amount: '100.0000',
              currency: 'USD',
              fromValue: '100.0000',
              toValue: '2000000.0000',
            }),
          ],
          'IDR',
        ),
        'IDR',
      ),
    ).toThrow(/no row of this file says what currency that wallet holds/);
  });

  it('refuses a pair whose two rows disagree about the primary-currency figure', () => {
    // Column 6 is part of what makes two rows one transfer, so a pair that disagrees about it never pairs —
    // and what a person sees is the row whose other half cannot be found. There is no second check to reach:
    // the pairing key is the enforcement.
    const rows = pair({
      from: 'Cash TST',
      to: 'Cash TS0',
      primaryValue: '1250000.0000',
      amount: '5000000.0000',
      currency: TS0,
      fromValue: '1250000.0000',
      toValue: '5000000.0000',
    });

    const broken = [rows[0], { ...(rows[1] as CashbookRow), primaryValue: '9999999.0000' }];

    expect(() => planCashbook(parsed(broken as CashbookRow[]), TST)).toThrow(/holds no matching Transfer-In/);
  });

  it('refuses a transfer whose other half is not in the file', () => {
    expect(() =>
      planCashbook(
        parsed([
          row({
            accounts: 'Cash TST',
            category: 'Cash TS0',
            literal: CASHBOOK_LITERALS.transferOut,
            primaryValue: '1250000.0000',
            amount: '5000000.0000',
            currency: TS0,
            accounts2: '1250000.0000',
          }),
        ]),
        TST,
      ),
    ).toThrow(/holds no matching Transfer-In/);
  });

  it('refuses an income or an expense whose category is missing', () => {
    // `prepare.ts` requires a category for both types, so a row without one is not a transaction this
    // application could have written. Inventing a category would silently change the ledger's breakdown.
    expect(() =>
      planCashbook(
        parsed([
          row({
            accounts: 'Cash TST',
            category: '',
            literal: CASHBOOK_LITERALS.expense,
            primaryValue: '250000.0000',
            accounts2: '250000.0000',
            currency: TST,
          }),
        ]),
        TST,
      ),
    ).toThrow(/with no category in column 3/);
  });

  it('refuses a file written in another ledger’s primary currency', () => {
    // Column 6 is frozen, not converted (ADR-0004). An IDR file in a TST account would freeze IDR figures as
    // TST ones, and every total the account ever reported afterwards would be wrong.
    expect(() => planCashbook(parsed([row()], 'IDR'), TST)).toThrow(/frozen, not converted/);
  });

  it('takes the date off Period, which is the only date the shape has', () => {
    const plan = planCashbook(
      parsed([
        ...pair({
          from: 'Cash TST',
          to: 'Bank TST',
          primaryValue: '300000.0000',
          amount: '300000.0000',
          currency: TST,
          fromValue: '300000.0000',
          toValue: '300000.0000',
          period: STRADDLED,
        }),
      ]),
      TST,
    );

    // The file holds no `occurred_on`, so the import reads the calendar date of the instant it does hold —
    // which is why a pair keyed in on 3 September for a 31 August entry lands in September when it comes back.
    expect(plan.writes[0]?.occurredOn).toBe('2026-09-03');
    expect(plan.from).toBe('2026-09-03');
  });

  it('reads the four literals and nothing else', async () => {
    // §12's own strictness: `Expense` is not `Exp.`, and a file that says otherwise is refused rather than
    // totalled under a guess.
    const base64 = await workbookOf([
      ['2026-08-01 00:00:00', 'Cash TST', 'Food', '', '', '25000.0000', 'Expense', '', '25000.0000', TST, '25000.0000'],
    ]);

    await expect(readCashbook(Buffer.from(base64, 'base64'))).rejects.toThrow(/Income\/Expense says "Expense"/);
  });
});

describe('POST /import/cashbook (Task 6.5, FR-12)', () => {
  let source: SpecLedger;
  let target: SpecLedger;

  const wallets = {
    cashTst: '',
    bankTst: '',
    cashTs0: '',
    bankTs0: '',
  };

  let foodId = '';

  const exportRange = async (ledger: SpecLedger, range: { startDate: string; endDate: string }): Promise<Response> =>
    exportCashbookSheet(ledger.request('/api/export/cashbook', { method: 'POST', body: range }), undefined);

  const importFile = async (ledger: SpecLedger, filename: string, contentBase64: string): Promise<Response> =>
    importCashbookFile(
      ledger.request('/api/import/cashbook', { method: 'POST', body: { filename, contentBase64 } }),
      undefined,
    );

  const record = async (body: Record<string, unknown>): Promise<string> => {
    const response = await createTransaction(source.request('/api/transactions', { method: 'POST', body }), undefined);
    const answer = await response.text();

    expect(response.status, answer).toBe(201);

    return (JSON.parse(answer) as { id: string }).id;
  };

  /** The instant a row is recorded at is the file's `Period`, so the fixture has to be able to set it. */
  const setRecordedAt = async (id: string, when: Date): Promise<void> => {
    await prisma.$executeRaw`UPDATE public.transaction SET recorded_at = ${when} WHERE id = ${id}::uuid`;
  };

  const balancesOf = async (userId: string): Promise<(string | null)[][]> => {
    const rows = await prisma.wallet.findMany({
      where: { user_id: userId },
      select: { name: true, currency_id: true, current_balance: true },
      orderBy: { name: 'asc' },
    });

    return rows.map((wallet) => [wallet.name, wallet.currency_id, wallet.current_balance.toFixed(4)]);
  };

  /** Every `occurred_on` in a ledger, in order — the field the cashbook shape has no column for. */
  const occurredOnsOf = async (userId: string): Promise<string[]> => {
    const rows = await prisma.transaction.findMany({
      where: { user_id: userId, deleted_at: null },
      select: { occurred_on: true },
      orderBy: { occurred_on: 'asc' },
    });

    return rows.map((row) => row.occurred_on.toISOString().slice(0, 10));
  };

  const totalsOf = async (userId: string): Promise<(string | number)[][]> => {
    const rows = await prisma.transaction.groupBy({
      by: ['transaction_type'],
      where: { user_id: userId, deleted_at: null },
      _sum: { base_amount: true },
      _count: true,
    });

    return rows
      .map((group) => [group.transaction_type, group._sum.base_amount?.toFixed(4) ?? '0.0000', group._count])
      .sort();
  };

  beforeAll(async () => {
    source = await signedInLedger('phase-6-import-source@ripis.test');
    target = await signedInLedger('phase-6-import-target@ripis.test');

    const wallet = async (name: string, currencyId: string): Promise<string> => {
      const response = await createWallet(
        source.request('/api/wallets', {
          method: 'POST',
          body: { name, walletType: 'cash', currencyId, openingBalance: '0' },
        }),
        undefined,
      );

      expect(response.status).toBe(201);

      return ((await response.json()) as { id: string }).id;
    };

    const category = async (name: string, type: string): Promise<string> => {
      const response = await createCategory(
        source.request('/api/categories', { method: 'POST', body: { name, type, color: '#D22129' } }),
        undefined,
      );

      expect(response.status).toBe(201);

      return ((await response.json()) as { id: string }).id;
    };

    wallets.cashTst = await wallet('Cash TST', TST);
    wallets.bankTst = await wallet('Bank TST', TST);
    wallets.cashTs0 = await wallet('Cash TS0', TS0);
    wallets.bankTs0 = await wallet('Bank TS0', TS0);

    foodId = await category('Import Food', 'expense');

    // Two pairs on one instant; one of them leaves the foreign currency and one leaves the primary one.
    const firstPair = await record({
      transactionType: 'exchange',
      occurredOn: '2026-08-20',
      walletId: wallets.cashTst,
      destinationWalletId: wallets.cashTs0,
      amount: '1250000',
      destinationAmount: '5000000',
      baseAmount: '1250000',
      description: 'august exchange out of the primary currency',
    });

    const secondPair = await record({
      transactionType: 'exchange',
      occurredOn: '2026-08-20',
      walletId: wallets.bankTst,
      destinationWalletId: wallets.bankTs0,
      amount: '2000000',
      destinationAmount: '8000000',
      baseAmount: '2000000',
      description: 'second pair, same instant',
    });

    await setRecordedAt(firstPair, SAME_INSTANT);
    await setRecordedAt(secondPair, SAME_INSTANT);

    // Three pairs on one instant, including one that is a plain same-currency transfer.
    const thirdPair = await record({
      transactionType: 'exchange',
      occurredOn: '2026-08-21',
      walletId: wallets.cashTs0,
      destinationWalletId: wallets.bankTst,
      amount: '3000000',
      destinationAmount: '750000',
      baseAmount: '750000',
      description: 'exchange out of the foreign currency',
    });

    const fourthPair = await record({
      transactionType: 'exchange',
      occurredOn: '2026-08-21',
      walletId: wallets.cashTst,
      destinationWalletId: wallets.bankTs0,
      amount: '500000',
      destinationAmount: '2000000',
      baseAmount: '500000',
      description: 'third exchange',
    });

    const sameCurrency = await record({
      transactionType: 'transfer',
      occurredOn: '2026-08-21',
      walletId: wallets.bankTst,
      destinationWalletId: wallets.cashTst,
      amount: '400000',
      baseAmount: '400000',
      description: 'same-currency transfer',
    });

    await setRecordedAt(thirdPair, THREE_PAIRS);
    await setRecordedAt(fourthPair, THREE_PAIRS);
    await setRecordedAt(sameCurrency, THREE_PAIRS);

    // One pair and one ordinary entry on one instant.
    const mixedPair = await record({
      transactionType: 'exchange',
      occurredOn: '2026-08-22',
      walletId: wallets.cashTst,
      destinationWalletId: wallets.cashTs0,
      amount: '100000',
      destinationAmount: '400000',
      baseAmount: '100000',
      description: 'pair sharing an instant with an entry',
    });

    const ordinary = await record({
      transactionType: 'expense',
      occurredOn: '2026-08-22',
      walletId: wallets.cashTst,
      categoryId: foodId,
      amount: '250000',
      baseAmount: '250000',
      description: 'an ordinary expense',
      notes: 'groceries',
    });

    await setRecordedAt(mixedPair, MIXED_INSTANT);
    await setRecordedAt(ordinary, MIXED_INSTANT);

    // A reconciliation, which is an ordinary row noted `Balance Difference` (ADR-0017) and imports verbatim.
    const reconciliation = await record({
      transactionType: 'expense',
      occurredOn: '2026-08-25',
      walletId: wallets.cashTst,
      categoryId: foodId,
      amount: '12345',
      baseAmount: '12345',
      description: 'balance difference',
      notes: 'Balance Difference — the statement says 12,345',
    });

    await setRecordedAt(reconciliation, new Date('2026-08-25T10:00:00.000Z'));

    // The straddled pair: 31 August happened, 3 September written (§12's warning, and the plan's last shape).
    const straddled = await record({
      transactionType: 'transfer',
      occurredOn: '2026-08-31',
      walletId: wallets.cashTst,
      destinationWalletId: wallets.bankTst,
      amount: '300000',
      baseAmount: '300000',
      description: 'keyed in the following month',
    });

    await setRecordedAt(straddled, STRADDLED);
  });

  afterAll(async () => {
    await closeLedger(source);
    await closeLedger(target);
    await teardownTestData();
  });

  it('round-trips a range into an empty ledger: the same balances, wallets and totals', async () => {
    const exported = await exportRange(source, THROUGH_SEPTEMBER);

    expect(exported.status).toBe(200);

    const file = Buffer.from(await exported.arrayBuffer());
    const rowsBefore = dataRowsOf(await sheetOf(new Response(file)));

    expect(rowsBefore).toHaveLength(16);

    const imported = await importFile(target, 'round-trip.xlsx', file.toString('base64'));

    expect(imported.status, await imported.clone().text()).toBe(200);
    expect(await imported.json()).toEqual({
      rows: 16,
      transactions: 9,
      walletsCreated: 4,
      categoriesCreated: 1,
      from: '2026-08-20',
      to: '2026-09-03',
    });

    // Balances: the figure every screen shows, rebuilt from the rows that justify it.
    expect(await balancesOf(target.userId)).toEqual(await balancesOf(source.userId));

    // Wallets: the same names holding the same currencies — the file names wallets and nothing else.
    expect((await balancesOf(target.userId)).map((wallet) => wallet.slice(0, 2))).toEqual(
      (await balancesOf(source.userId)).map((wallet) => wallet.slice(0, 2)),
    );

    // Totals: what came in and went out, in the frozen primary-currency figure.
    expect(await totalsOf(target.userId)).toEqual(await totalsOf(source.userId));

    // And the strongest form of the same claim: the ledger, exported again, holds the same rows. `Period` is
    // dropped because a row records when it was written (ADR-0007) and an import writes now — see the module
    // comment in `src/server/import/cashbook.ts`.
    const reExported = await exportRange(target, THROUGH_SEPTEMBER);

    expect(dataRowsOf(await sheetOf(reExported))).toEqual(rowsBefore);
  });

  it('rebuilds a pair as one transaction, so the two rows share one Period', async () => {
    // The property the whole pairing rests on. If the import wrote a transfer's two rows as two transactions,
    // the next export would print two different instants for one pair and the file would stop round-tripping.
    const rows = (await sheetOf(await exportRange(target, THROUGH_SEPTEMBER))).slice(1);
    const outs = rows.filter((row) => text(row, COLUMN.literal) === CASHBOOK_LITERALS.transferOut);

    expect(outs).toHaveLength(7);

    for (const out of outs) {
      const partner = rows.find(
        (row) =>
          text(row, COLUMN.literal) === CASHBOOK_LITERALS.transferIn &&
          text(row, COLUMN.period) === text(out, COLUMN.period) &&
          text(row, COLUMN.accounts) === text(out, COLUMN.category) &&
          text(row, COLUMN.category) === text(out, COLUMN.accounts),
      );

      expect(partner, `no partner for the ${text(out, COLUMN.accounts)} → ${text(out, COLUMN.category)} row`).toBeDefined();
    }
  });

  it('records the import in the audit log, with what it wrote', async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { user_id: target.userId, entity_type: 'import', action: 'imported' },
    });

    expect(audit).not.toBeNull();
    expect(audit?.after_value).toMatchObject({
      kind: 'cashbook',
      filename: 'round-trip.xlsx',
      rows: 16,
      transactions: 9,
    });
  });

  it('imports a reconciliation verbatim, note and all', async () => {
    // ADR-0017: a reconciliation is an ordinary income or expense whose note is its only marker. The file
    // carries the note and nothing else about it, so the import must not treat it as a shape of its own.
    const rows = await sheetOf(await exportRange(target, AUGUST));
    const reconciliation = rows.slice(1).find((row) => text(row, COLUMN.note).startsWith('Balance Difference'));

    expect(reconciliation).toBeDefined();
    expect(text(reconciliation as SheetRow, COLUMN.accounts2)).toBe('12345.0000');
    expect(text(reconciliation as SheetRow, COLUMN.literal)).toBe(CASHBOOK_LITERALS.expense);
  });

  it('files the straddled pair in the month it was written, and says so', async () => {
    // `Period` renders `recorded_at` and the range filters `occurred_on`, so the 31 August row is in August's
    // file with a September instant. The import has no other date to read, so it comes back as September —
    // a limit of §12's eleven columns rather than of the import, and the reason it is asserted rather than
    // discovered later.
    const sourceAugust = await sheetOf(await exportRange(source, AUGUST));
    const targetAugust = await sheetOf(await exportRange(target, AUGUST));

    const straddled = (rows: SheetRow[]) =>
      rows.slice(1).filter((row) => text(row, COLUMN.description) === 'keyed in the following month');

    expect(straddled(sourceAugust)).toHaveLength(2);
    expect(straddled(targetAugust)).toHaveLength(0);

    // It is not lost: it moved, and the same range that held it before holds it now.
    const targetSeptember = await sheetOf(await exportRange(target, { startDate: '2026-09-01', endDate: '2026-09-30' }));

    expect(straddled(targetSeptember)).toHaveLength(2);
  });

  it('leaves a wallet short by exactly the opening balance the format cannot carry', async () => {
    // §12's columns have no opening balance, so an imported wallet opens at zero. Stated as its own test so
    // the gap is visible: the round trip above is identical because its wallets opened at zero.
    const opened = await signedInLedger('phase-6-import-opening@ripis.test');
    const empty = await signedInLedger('phase-6-import-copy@ripis.test');

    try {
      const created = await createWallet(
        opened.request('/api/wallets', {
          method: 'POST',
          body: { name: 'Opened TST', walletType: 'cash', currencyId: TST, openingBalance: '1000' },
        }),
        undefined,
      );

      const walletId = ((await created.json()) as { id: string }).id;

      // Its own category: a category belongs to one ledger, and `requireCategoryForType` reads it through the
      // caller's own scope, so another account's id is a 404 rather than a shared row (ADR-0020).
      const category = await createCategory(
        opened.request('/api/categories', { method: 'POST', body: { name: 'Opened Food', type: 'expense', color: '#D22129' } }),
        undefined,
      );

      const categoryId = ((await category.json()) as { id: string }).id;

      await createTransaction(
        opened.request('/api/transactions', {
          method: 'POST',
          body: {
            transactionType: 'expense',
            occurredOn: '2026-08-10',
            walletId,
            categoryId,
            amount: '250',
            baseAmount: '250',
          },
        }),
        undefined,
      );

      const file = Buffer.from(await (await exportRange(opened, AUGUST)).arrayBuffer());
      const response = await importFile(empty, 'opening.xlsx', file.toString('base64'));

      expect(response.status, await response.clone().text()).toBe(200);

      const copied = await balancesOf(empty.userId);

      expect(copied).toEqual([['Opened TST', TST, '-250.0000']]);
      expect(await balancesOf(opened.userId)).toEqual([['Opened TST', TST, '750.0000']]);
    } finally {
      await closeLedger(opened);
      await closeLedger(empty);
    }
  });

  it('creates a category as the importer’s colour, and reuses the one that is there', async () => {
    const rows = await prisma.category.findMany({
      where: { user_id: target.userId },
      select: { name: true, type: true, color: true },
      orderBy: { name: 'asc' },
    });

    expect(rows).toEqual([{ name: 'Import Food', type: 'expense', color: '#6B7280' }]);
  });

  it('round-trips a single month when nothing in it straddles the boundary', async () => {
    // Task 6.5's acceptance test in its own words — "export a **month** → reimport into an empty database →
    // identical balances, wallets and totals" — with no qualification needed, because this fixture holds no
    // straddled pair. The range compared above is two months precisely because one mandated shape straddles.
    const month = await signedInLedger('phase-6-import-month@ripis.test');
    const copy = await signedInLedger('phase-6-import-month-copy@ripis.test');

    try {
      const wallet = async (name: string): Promise<string> => {
        const response = await createWallet(
          month.request('/api/wallets', {
            method: 'POST',
            body: { name, walletType: 'cash', currencyId: TST, openingBalance: '0' },
          }),
          undefined,
        );

        expect(response.status).toBe(201);

        return ((await response.json()) as { id: string }).id;
      };

      const first = await wallet('Month A');
      const second = await wallet('Month B');

      const category = await createCategory(
        month.request('/api/categories', { method: 'POST', body: { name: 'Month Food', type: 'expense', color: '#D22129' } }),
        undefined,
      );

      const categoryId = ((await category.json()) as { id: string }).id;

      const expense = await createTransaction(
        month.request('/api/transactions', {
          method: 'POST',
          body: {
            transactionType: 'expense',
            occurredOn: '2026-08-05',
            walletId: first,
            categoryId,
            amount: '50000',
            baseAmount: '50000',
          },
        }),
        undefined,
      );

      const transfer = await createTransaction(
        month.request('/api/transactions', {
          method: 'POST',
          body: {
            transactionType: 'transfer',
            occurredOn: '2026-08-06',
            walletId: first,
            destinationWalletId: second,
            amount: '30000',
            baseAmount: '30000',
          },
        }),
        undefined,
      );

      expect(expense.status).toBe(201);
      expect(transfer.status).toBe(201);

      // Both entries are keyed in during the month they happened, which is the case the round trip is
      // *lossless* for. `Period` renders `recorded_at`, so a row written in another month comes back in that
      // other month — see the straddle test above, where that is the point.
      await setRecordedAt(((await expense.json()) as { id: string }).id, new Date('2026-08-05T09:00:00.000Z'));
      await setRecordedAt(((await transfer.json()) as { id: string }).id, new Date('2026-08-06T09:00:00.000Z'));

      const file = Buffer.from(await (await exportRange(month, AUGUST)).arrayBuffer());
      const response = await importFile(copy, 'august.xlsx', file.toString('base64'));

      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({
        rows: 3,
        transactions: 2,
        walletsCreated: 2,
        categoriesCreated: 1,
        from: '2026-08-05',
        to: '2026-08-06',
      });

      expect(await balancesOf(copy.userId)).toEqual(await balancesOf(month.userId));
      expect(await totalsOf(copy.userId)).toEqual(await totalsOf(month.userId));
      // The dates too: `occurred_on` is the one field the file does not carry, so this is the assertion that
      // says it survived — and it is only available here, because the cashbook shape has no date column to
      // re-export it into.
      expect(await occurredOnsOf(copy.userId)).toEqual(await occurredOnsOf(month.userId));
      expect(dataRowsOf(await sheetOf(await exportRange(copy, AUGUST)))).toEqual(
        dataRowsOf(await sheetOf(await exportRange(month, AUGUST))),
      );
    } finally {
      await closeLedger(month);
      await closeLedger(copy);
    }
  });
});

describe('POST /import/cashbook refuses what it cannot read (Task 6.5)', () => {
  let ledger: SpecLedger;

  const importFile = async (filename: string, contentBase64: string): Promise<Response> =>
    importCashbookFile(
      ledger.request('/api/import/cashbook', { method: 'POST', body: { filename, contentBase64 } }),
      undefined,
    );

  /** The code and field of a refusal, which is what §6.1 says a caller can act on. */
  const refusalOf = async (response: Response): Promise<{ code: string; field?: string }> =>
    ((await response.json()) as { error: { code: string; field?: string } }).error;

  beforeAll(async () => {
    ledger = await signedInLedger('phase-6-import-refusals@ripis.test');
  });

  afterAll(async () => {
    await closeLedger(ledger);
    await teardownTestData();
  });

  it('refuses a row whose Income/Expense is Expense rather than Exp.', async () => {
    const base64 = await workbookOf([
      ['2026-08-01 00:00:00', 'Cash TST', 'Food', '', '', '25000.0000', 'Expense', '', '25000.0000', TST, '25000.0000'],
    ]);

    const response = await importFile('wrong-literal.xlsx', base64);

    expect(response.status).toBe(400);
    expect(await refusalOf(response)).toMatchObject({ code: 'validation_failed' });
    // A refusal is a refusal: the ledger it was aimed at is untouched.
    expect(await prisma.transaction.count({ where: { user_id: ledger.userId } })).toBe(0);
  });

  it('refuses a file whose column 6 is headed with another ledger’s currency', async () => {
    const base64 = await workbookOf(
      [['2026-08-01 00:00:00', 'Cash IDR', 'Food', '', '', '25000.0000', 'Exp.', '', '25000.0000', 'IDR', '25000.0000']],
      'IDR',
    );

    const response = await importFile('idr.xlsx', base64);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(
      /column 6 is headed IDR, and this account's primary currency is TST/,
    );
  });

  it('refuses a transfer with only one side', async () => {
    const base64 = await workbookOf([
      [
        '2026-08-01 00:00:00',
        'Cash TST',
        'Cash TS0',
        '',
        '',
        '1250000.0000',
        CASHBOOK_LITERALS.transferOut,
        '',
        '5000000.0000',
        TS0,
        '1250000.0000',
      ],
    ]);

    const response = await importFile('one-sided.xlsx', base64);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(/holds no matching Transfer-In/);
  });

  it('refuses an expense with no category, rather than inventing one', async () => {
    const base64 = await workbookOf([
      ['2026-08-01 00:00:00', 'Cash TST', '', '', '', '25000.0000', 'Exp.', '', '25000.0000', TST, '25000.0000'],
    ]);

    const response = await importFile('no-category.xlsx', base64);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(/with no category in column 3/);
  });

  it('refuses a body that is not a spreadsheet', async () => {
    const response = await importFile('notes.txt', Buffer.from('this is not a workbook').toString('base64'));

    expect(response.status).toBe(400);
    expect(await refusalOf(response)).toEqual({
      code: 'validation_failed',
      field: 'contentBase64',
      message: 'contentBase64 must be a spreadsheet file, base64 encoded.',
    });
  });

  it('refuses a field the endpoint has no use for', async () => {
    const response = await importCashbookFile(
      ledger.request('/api/import/cashbook', {
        method: 'POST',
        body: { filename: 'x.xlsx', contentBase64: 'PK', startDate: '2026-08-01' },
      }),
      undefined,
    );

    expect(response.status).toBe(400);
    expect((await refusalOf(response)).code).toBe('validation_failed');
  });

  it('refuses a file with nothing in it', async () => {
    const response = await importFile('empty.xlsx', await workbookOf([]));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(/no entries in it/);
  });
});
