import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as exportCashbookSheet } from '../app/api/export/cashbook/route';
import { POST as createCategory } from '../app/api/categories/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { cashbookEntries, cashbookHeaders, type CashbookSource } from '../src/server/export/cashbook';
import { XLSX_CONTENT_TYPE } from '../src/server/export/file';
import { CURRENCIES, prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * The cashbook export of §12 (FR-12, Task 6.4) — the shape that has to round-trip (ADR-0008).
 *
 * §12 names the two ways this file goes wrong, and both are asserted here rather than described:
 *
 * - **A timestamp is not a pair key.** The reference history's 1,069 transfer pairs sit across 1,062
 *   timestamps, 5 of which carry more than one pair. So the two rows a transfer becomes are synthesised from
 *   the one transaction that produced them and are never matched back to each other by their instant — and
 *   two transfers forced onto the *same* instant must still name their own counterparties.
 * - **The range filters `occurred_on`; `Period` renders `recorded_at`.** A file must never be *selected* by
 *   one field and *rendered* from the other, so a row keyed in during November for an August entry is in the
 *   August file with a November `Period`, and a row keyed in during August for an October entry is not in it.
 *
 * The mapping itself is a pure function, so §12's own worked example (`Hutang` → `Cash VND`) is asserted
 * against it directly: the contract is what should fail, not a fixture that happens to agree with the code.
 *
 * **Money is written as the exact 4-dp string, and the reference file's number cells are not reproduced.**
 * See ADR-0057: a number cell is a `double`, `Decimal(19,4)` is nineteen significant digits, and the importer
 * has to read the reference's numbers regardless.
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

const AUGUST = { startDate: '2026-08-01', endDate: '2026-08-31' };
const SAME_INSTANT = new Date('2026-08-20T01:02:03.000Z');

let ledger: SpecLedger;
let tstWalletId: string;
let ts0WalletId: string;
let foodId: string;
let salaryId: string;

/** A hand-built transaction, for the pure mapping tests. */
function source(over: Partial<CashbookSource> & Pick<CashbookSource, 'transaction_type'>): CashbookSource {
  return {
    amount: new Prisma.Decimal('0'),
    currency_id: 'IDR',
    destination_amount: null,
    base_amount: new Prisma.Decimal('0'),
    recorded_at: SAME_INSTANT,
    description: null,
    notes: null,
    wallet: { name: 'Wallet', currency_id: 'IDR' },
    destination: null,
    category: null,
    ...over,
  };
}

function at<T>(items: T[], index: number): T {
  const item = items[index];

  if (item === undefined) {
    throw new Error(`expected an item at ${index}, found ${items.length} in total`);
  }

  return item;
}

interface SheetRow {
  values: ExcelJS.CellValue[];
  types: (ExcelJS.ValueType | undefined)[];
}

/** The first worksheet as rows of raw cells, so a test can assert a value *and* its type. */
async function rowsOf(response: Response): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(
    Buffer.from(await response.arrayBuffer()) as unknown as ExcelJS.Buffer,
  );

  const sheet = workbook.worksheets[0];

  if (sheet === undefined) {
    throw new Error('the export produced no worksheet');
  }

  const rows: SheetRow[] = [];

  for (let index = 1; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const values: ExcelJS.CellValue[] = [];
    const types: (ExcelJS.ValueType | undefined)[] = [];

    for (let column = 1; column <= 11; column += 1) {
      const cell = row.getCell(column);
      values.push(cell.value);
      types.push(cell.type);
    }

    rows.push({ values, types });
  }

  return rows;
}

function text(row: SheetRow, column: number): string {
  const value = row.values[column];

  return value === null || value === undefined ? '' : String(value);
}

const descriptionsOf = (rows: SheetRow[]): string[] =>
  rows.slice(1).map((row) => text(row, COLUMN.description));

const exportCashbook = async (body: Record<string, string>): Promise<Response> =>
  exportCashbookSheet(ledger.request('/api/export/cashbook', { method: 'POST', body }), undefined);

async function record(body: Record<string, unknown>): Promise<string> {
  const response = await createTransaction(
    ledger.request('/api/transactions', { method: 'POST', body }),
    undefined,
  );

  const answer = await response.text();

  expect(response.status, answer).toBe(201);

  return (JSON.parse(answer) as { id: string }).id;
}

/** The instant a row is recorded at is the file's `Period`, so the fixture has to be able to set it. */
async function setRecordedAt(id: string, when: Date): Promise<void> {
  await prisma.$executeRaw`UPDATE public.transaction SET recorded_at = ${when} WHERE id = ${id}::uuid`;
}

describe('the cashbook shape (§12)', () => {
  it('maps §12s worked example, a cross-currency transfer, row for row', () => {
    const hutang = source({
      transaction_type: 'transfer',
      amount: new Prisma.Decimal('3196875'),
      currency_id: 'IDR',
      base_amount: new Prisma.Decimal('3196875'),
      destination_amount: new Prisma.Decimal('5000000'),
      wallet: { name: 'Hutang', currency_id: 'IDR' },
      destination: { name: 'Cash VND', currency_id: 'VND' },
    });

    const entries = cashbookEntries([hutang], 'IDR');

    expect(entries).toHaveLength(2);

    // §12's table gives this row as `3196875` because the reference file holds numbers; the value and the
    // meaning are the same, and the four decimal places are the wire form of money (§6.1).
    expect(at(entries, 0)).toMatchObject({
      period: SAME_INSTANT,
      accounts: 'Hutang',
      category: 'Cash VND',
      primaryValue: '3196875.0000',
      literal: 'Transfer-Out',
      amount: '5000000.0000',
      currency: 'VND',
      accounts2: '3196875.0000',
    });

    // Only `Accounts2` differs between the two rows, and it is the value of *this* leg in *its* wallet.
    expect(at(entries, 1)).toMatchObject({
      period: SAME_INSTANT,
      accounts: 'Cash VND',
      category: 'Hutang',
      primaryValue: '3196875.0000',
      literal: 'Transfer-In',
      amount: '5000000.0000',
      currency: 'VND',
      accounts2: '5000000.0000',
    });
  });

  it(`keeps two transfers that share an instant apart, by counterparty`, () => {
    const outOfHutang = source({
      transaction_type: 'transfer',
      amount: new Prisma.Decimal('100'),
      currency_id: 'IDR',
      base_amount: new Prisma.Decimal('100'),
      destination_amount: new Prisma.Decimal('2000000'),
      wallet: { name: 'Hutang', currency_id: 'IDR' },
      destination: { name: 'Cash VND', currency_id: 'VND' },
    });

    const outOfCash = source({
      transaction_type: 'transfer',
      amount: new Prisma.Decimal('3000000'),
      currency_id: 'VND',
      base_amount: new Prisma.Decimal('150'),
      destination_amount: new Prisma.Decimal('150'),
      wallet: { name: 'Cash VND', currency_id: 'VND' },
      destination: { name: 'Hutang', currency_id: 'IDR' },
    });

    const entries = cashbookEntries([outOfHutang, outOfCash], 'IDR');

    // Four rows, all on one instant. A matcher keyed on the timestamp would pair `Hutang`'s out with
    // `Hutang`'s in and call it a transfer between the same two wallets — which is what two of these rows
    // look like and is wrong for both.
    expect(entries.map((entry) => [entry.accounts, entry.category, entry.literal])).toEqual([
      ['Hutang', 'Cash VND', 'Transfer-Out'],
      ['Cash VND', 'Hutang', 'Transfer-In'],
      ['Cash VND', 'Hutang', 'Transfer-Out'],
      ['Hutang', 'Cash VND', 'Transfer-In'],
    ]);
  });

  it('names the source leg when neither leg is in the primary currency', () => {
    const dollarsToDong = source({
      transaction_type: 'exchange',
      amount: new Prisma.Decimal('100'),
      currency_id: 'USD',
      base_amount: new Prisma.Decimal('1500000'),
      destination_amount: new Prisma.Decimal('2000000'),
      wallet: { name: 'US Cash', currency_id: 'USD' },
      destination: { name: 'Cash VND', currency_id: 'VND' },
    });

    const entries = cashbookEntries([dollarsToDong], 'IDR');

    // Both legs are foreign, so the column that cannot hold both holds the leg that left — and the value of
    // the arrival is still on its own row, in `Accounts2`.
    expect(entries.map((entry) => [entry.amount, entry.currency, entry.accounts2])).toEqual([
      ['100.0000', 'USD', '100.0000'],
      ['100.0000', 'USD', '2000000.0000'],
    ]);
  });

  it('names column 6 after the primary currency', () => {
    expect(cashbookHeaders('IDR')).toEqual([
      'Period',
      'Accounts',
      'Category',
      'Subcategory',
      'Note',
      'IDR',
      'Income/Expense',
      'Description',
      'Amount',
      'Currency',
      'Accounts2',
    ]);
  });
});

describe('POST /export/cashbook', () => {
  beforeAll(async () => {
    ledger = await signedInLedger('phase-6-cashbook@ripis.test');

    const primary = CURRENCIES.base.code;
    const zeroDecimal = CURRENCIES.zeroDecimal.code;

    const wallet = async (name: string, currencyId: string): Promise<string> => {
      const response = await createWallet(
        ledger.request('/api/wallets', {
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
        ledger.request('/api/categories', {
          method: 'POST',
          body: { name, type, color: '#D22129' },
        }),
        undefined,
      );

      expect(response.status).toBe(201);

      return ((await response.json()) as { id: string }).id;
    };

    tstWalletId = await wallet('Cash TST', primary);
    ts0WalletId = await wallet('Zero TS0', zeroDecimal);
    foodId = await category('Cashbook Food', 'expense');
    salaryId = await category('Cashbook Salary', 'income');

    // An ordinary expense and an income — one row each.
    await record({
      transactionType: 'expense',
      occurredOn: '2026-08-01',
      walletId: tstWalletId,
      categoryId: foodId,
      amount: '25000',
      baseAmount: '25000',
      description: 'august expense',
      notes: 'a note',
    });

    await record({
      transactionType: 'income',
      occurredOn: '2026-08-02',
      walletId: tstWalletId,
      categoryId: salaryId,
      amount: '30000',
      baseAmount: '30000',
      description: 'august income',
    });

    // Two transfers, in opposite directions, forced onto ONE instant — the pair-key trap.
    const leaving = await record({
      transactionType: 'transfer',
      occurredOn: '2026-08-20',
      walletId: tstWalletId,
      destinationWalletId: ts0WalletId,
      amount: '1000',
      baseAmount: '1000',
      destinationAmount: '10000',
      description: 'august transfer',
    });

    const returning = await record({
      transactionType: 'transfer',
      occurredOn: '2026-08-21',
      walletId: ts0WalletId,
      destinationWalletId: tstWalletId,
      amount: '500',
      baseAmount: '50',
      destinationAmount: '50',
      description: 'reverse transfer',
    });

    await setRecordedAt(leaving, SAME_INSTANT);
    await setRecordedAt(returning, SAME_INSTANT);

    // Keyed in during November for an August entry: in the August file, with a November `Period`.
    const late = await record({
      transactionType: 'expense',
      occurredOn: '2026-08-15',
      walletId: tstWalletId,
      categoryId: foodId,
      amount: '7777',
      baseAmount: '7777',
      description: 'keyed in november',
    });

    await setRecordedAt(late, new Date('2026-11-03T01:02:03.000Z'));

    // Keyed in during August for an October entry: NOT in the August file, however its instant reads.
    const postDated = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-05',
      walletId: tstWalletId,
      categoryId: foodId,
      amount: '1234',
      baseAmount: '1234',
      description: 'happened in october',
    });

    await setRecordedAt(postDated, new Date('2026-08-05T01:02:03.000Z'));

    // The plan's own form of the trap: an October entry keyed in during November, so an OCTOBER export must
    // contain it and print a November `Period`.
    const keyedInNextMonth = await record({
      transactionType: 'expense',
      occurredOn: '2026-10-10',
      walletId: tstWalletId,
      categoryId: foodId,
      amount: '4321',
      baseAmount: '4321',
      description: 'october entry keyed in november',
    });

    await setRecordedAt(keyedInNextMonth, new Date('2026-11-05T06:07:08.000Z'));
  });

  afterAll(async () => {
    await closeLedger(ledger);
    await teardownTestData();
  });

  it(`writes §12s eleven columns in order, headed by the ledger's primary currency`, async () => {
    const response = await exportCashbook(AUGUST);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(XLSX_CONTENT_TYPE);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="ripis-cashbook-2026-08-01~2026-08-31.xlsx"',
    );

    const rows = await rowsOf(response);

    expect(rows).toHaveLength(8);

    expect(rows[0]?.values).toEqual([
      'Period',
      'Accounts',
      'Category',
      'Subcategory',
      'Note',
      CURRENCIES.base.code,
      'Income/Expense',
      'Description',
      'Amount',
      'Currency',
      'Accounts2',
    ]);

    // `Subcategory` ships empty: the reference has the column and the model has no subcategories (ADR-0014).
    expect(rows.slice(1).map((row) => text(row, COLUMN.subcategory))).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('synthesises two mirrored rows per transfer, and one for everything else', async () => {
    const rows = await rowsOf(await exportCashbook(AUGUST));
    const table = rows.slice(1).map((row) => [
      text(row, COLUMN.accounts),
      text(row, COLUMN.category),
      text(row, COLUMN.literal),
      text(row, COLUMN.primary),
      text(row, COLUMN.amount),
      text(row, COLUMN.currency),
      text(row, COLUMN.accounts2),
    ]);

    // Five transactions in the range, seven rows out — and the two transfers that share an instant are still
    // four rows naming four counterparties, in the order their transactions were recorded.
    expect(table).toEqual([
      ['Cash TST', 'Zero TS0', 'Transfer-Out', '1000.0000', '10000.0000', 'TS0', '1000.0000'],
      ['Zero TS0', 'Cash TST', 'Transfer-In', '1000.0000', '10000.0000', 'TS0', '10000.0000'],
      ['Zero TS0', 'Cash TST', 'Transfer-Out', '50.0000', '500.0000', 'TS0', '500.0000'],
      ['Cash TST', 'Zero TS0', 'Transfer-In', '50.0000', '500.0000', 'TS0', '50.0000'],
      ['Cash TST', 'Cashbook Food', 'Exp.', '25000.0000', '25000.0000', CURRENCIES.base.code, '25000.0000'],
      ['Cash TST', 'Cashbook Salary', 'Income', '30000.0000', '30000.0000', CURRENCIES.base.code, '30000.0000'],
      ['Cash TST', 'Cashbook Food', 'Exp.', '7777.0000', '7777.0000', CURRENCIES.base.code, '7777.0000'],
    ]);
  });

  it('selects on occurred_on and renders recorded_at as Period', async () => {
    const rows = await rowsOf(await exportCashbook(AUGUST));
    const descriptions = descriptionsOf(rows);

    // Keyed in during November, about August: in the file, and its Period says November.
    expect(descriptions).toContain('keyed in november');

    const late = rows.find((row) => text(row, COLUMN.description) === 'keyed in november');
    const period = late?.values[COLUMN.period];

    expect(period).toBeInstanceOf(Date);
    expect((period as Date).toISOString()).toBe('2026-11-03T01:02:03.000Z');

    // Keyed in during August, about October: out of the file, because the range is the entry date.
    expect(descriptions).not.toContain('happened in october');

    // And the ordinary rows were keyed in today — neither August nor their own month — and are in the file
    // because their `occurred_on` is, which is the whole point of the rule. `Period` is asserted against the
    // stored `recorded_at` rather than against a month name: the suite has to pass on any day it is run.
    const august = rows.find((row) => text(row, COLUMN.description) === 'august expense');
    const stored = await prisma.transaction.findFirst({
      where: { description: 'august expense' },
      select: { recorded_at: true },
    });

    expect((august?.values[COLUMN.period] as Date).toISOString()).toBe(
      stored?.recorded_at.toISOString(),
    );
    expect((august?.values[COLUMN.period] as Date).getUTCMonth()).not.toBe(7);
  });

  it(`selects the October file for October entries and prints their November instants`, async () => {
    const rows = await rowsOf(
      await exportCashbook({ startDate: '2026-10-01', endDate: '2026-10-31' }),
    );
    const descriptions = descriptionsOf(rows);
    const keyedInNextMonth = rows.find(
      (row) => text(row, COLUMN.description) === 'october entry keyed in november',
    );

    // In the file, with a `Period` in the month after the one being exported.
    expect(descriptions).toContain('october entry keyed in november');
    expect((keyedInNextMonth?.values[COLUMN.period] as Date).toISOString()).toBe(
      '2026-11-05T06:07:08.000Z',
    );

    // The row keyed in during August for October is in the October file — it was outside the August one.
    expect(descriptions).toContain('happened in october');

    // And the August entries stay out, although they were keyed in *today*, which is October. Selection is
    // the entry date; nothing here is selected by the instant.
    expect(descriptions).not.toContain('august expense');
    expect(descriptions).not.toContain('keyed in november');
  });

  it('writes the two rows of a transfer on the same instant', async () => {
    const rows = await rowsOf(await exportCashbook(AUGUST));
    const transfer = rows
      .slice(1)
      .filter((row) => text(row, COLUMN.description) === 'august transfer');

    expect(transfer).toHaveLength(2);
    expect(transfer.map((row) => (row.values[COLUMN.period] as Date).toISOString())).toEqual([
      SAME_INSTANT.toISOString(),
      SAME_INSTANT.toISOString(),
    ]);
  });

  it('writes money as text, not as a number a spreadsheet may reformat', async () => {
    const rows = await rowsOf(await exportCashbook(AUGUST));

    for (const row of rows.slice(1)) {
      for (const column of [COLUMN.primary, COLUMN.amount, COLUMN.accounts2]) {
        // The reference file holds numbers here (§12's own table prints `3196875`); ADR-0057 records why the
        // exporter does not, and the importer reads both shapes.
        expect(row.types[column]).toBe(ExcelJS.ValueType.String);
      }
    }

    expect(text(at(rows, 1), COLUMN.amount)).toBe('10000.0000');
  });

  it('records the export in the audit log as a file, not as a row', async () => {
    const before = await exportedFiles();

    await exportCashbook(AUGUST);

    expect(await exportedFiles()).toBe(before + 1);

    const [entry] = await prisma.auditLog.findMany({
      where: { user_id: ledger.userId, entity_type: 'export', action: 'exported' },
      orderBy: { created_at: 'desc' },
      take: 1,
    });

    expect(entry?.entity_id).toBeNull();
    expect(entry?.after_value).toMatchObject({
      kind: 'cashbook',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      // The rows in the file, not the transactions behind them: six transactions are seven rows.
      rows: 7,
    });
  });

  it('refuses a field it does not have, a missing range and a date it cannot read', async () => {
    expect((await exportCashbook({ ...AUGUST, walletId: ts0WalletId })).status).toBe(400);
    expect((await exportCashbook({ startDate: '2026-08-01' })).status).toBe(400);
    expect((await exportCashbook({ startDate: '2026-02-30', endDate: '2026-08-31' })).status).toBe(400);
  });

  it(`exports the caller's rows and nobody else's`, async () => {
    const neighbour = await signedInLedger('phase-6-cashbook-neighbour@ripis.test');

    try {
      const wallet = await createWallet(
        neighbour.request('/api/wallets', {
          method: 'POST',
          body: {
            name: 'Neighbour Cash',
            walletType: 'cash',
            currencyId: CURRENCIES.base.code,
            openingBalance: '0',
          },
        }),
        undefined,
      );

      expect(wallet.status).toBe(201);

      const walletId = ((await wallet.json()) as { id: string }).id;

      const category = await createCategory(
        neighbour.request('/api/categories', {
          method: 'POST',
          body: { name: 'Neighbour Food', type: 'expense', color: '#D22129' },
        }),
        undefined,
      );

      expect(category.status).toBe(201);

      const categoryId = ((await category.json()) as { id: string }).id;

      expect(
        (
          await createTransaction(
            neighbour.request('/api/transactions', {
              method: 'POST',
              body: {
                transactionType: 'expense',
                occurredOn: '2026-08-12',
                walletId,
                categoryId,
                amount: '777',
                baseAmount: '777',
                description: 'neighbour august',
              },
            }),
            undefined,
          )
        ).status,
      ).toBe(201);

      const rows = await rowsOf(await exportCashbook(AUGUST));

      expect(descriptionsOf(rows)).not.toContain('neighbour august');
    } finally {
      await closeLedger(neighbour);
    }
  });
});

/** How many exports this ledger has on the audit log so far. */
async function exportedFiles(): Promise<number> {
  return prisma.auditLog.count({
    where: { user_id: ledger.userId, entity_type: 'export', action: 'exported' },
  });
}
