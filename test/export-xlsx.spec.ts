import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as createCategory } from '../app/api/categories/route';
import { POST as exportSheet } from '../app/api/export/xlsx/route';
import { POST as createTransaction } from '../app/api/transactions/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { EXPORT_HEADERS, XLSX_CONTENT_TYPE } from '../src/server/export/xlsx';
import { CURRENCIES, prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * The Excel export of §12 (FR-12, Task 6.3).
 *
 * Three claims in this file are load-bearing, and each has a plausible wrong answer that a passing test
 * could otherwise hide:
 *
 * **The range filters `occurred_on`.** Every row in this fixture was entered today through the API and
 * carries an `occurred_on` in the exported month, so an export that filtered on `recorded_at` would return
 * nothing at all — which is exactly the bug §12 warns about (ADR-0007).
 *
 * **Money is written as text.** A numeric cell is a number the spreadsheet is free to re-render, and
 * `1250000.0000` shown in scientific notation or trimmed to two decimals is a figure the user cannot check
 * against the app (§10). The assertions read the cell *type* back out of the saved file, not just its value.
 *
 * **`Created By` comes from the audit log.** The column is not the ledger owner: for a row an admin entered
 * on somebody's behalf they differ (§14, ADR-0046). The fixture swaps the actor on one transaction's
 * `created` audit row, so an export that read the owner instead would print the same name twice and fail.
 */

let ledger: SpecLedger;
let tstWalletId: string;
let ts0WalletId: string;
let foodId: string;

const ACTOR_EMAIL = 'phase-6-export-actor@ripis.test';
const ACTOR_NAME = 'Filmed Admin';
const OWNER_NAME = 'Phase 3 Spec';

/** The exported month. Nothing in the fixture is *recorded* in it. */
const AUGUST = { startDate: '2026-08-01', endDate: '2026-08-31' };

const AMOUNT_COLUMN = EXPORT_HEADERS.indexOf('Amount') + 1;
const DESCRIPTION_COLUMN = EXPORT_HEADERS.indexOf('Description') + 1;
const CREATED_BY_COLUMN = EXPORT_HEADERS.indexOf('Created By') + 1;

/** A transaction created through the real endpoint, whose id is needed to reach its audit row. */
const record = async (body: Record<string, unknown>): Promise<string> => {
  const response = await createTransaction(ledger.request('/api/transactions', { method: 'POST', body }), undefined);
  const answer = await response.text();

  expect(response.status, answer).toBe(201);

  return (JSON.parse(answer) as { id: string }).id;
};

const exportFile = async (range: Record<string, string>): Promise<Response> =>
  exportSheet(ledger.request('/api/export/xlsx', { method: 'POST', body: range }), undefined);

/** The saved file, read back the way a spreadsheet reads it: cell types and all. */
const rowsOf = async (response: Response): Promise<{ text: string[]; amountType: ExcelJS.ValueType | undefined }[]> => {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as unknown as ExcelJS.Buffer);

  const sheet = workbook.worksheets[0];

  if (sheet === undefined) throw new Error('the export produced no worksheet');

  const rows = [];

  for (let index = 1; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);

    rows.push({
      text: [...EXPORT_HEADERS.keys()].map((column) => String(row.getCell(column + 1).value ?? '')),
      amountType: row.getCell(AMOUNT_COLUMN).type,
    });
  }

  return rows;
};

const descriptionsOf = (rows: { text: string[] }[]): string[] =>
  rows.slice(1).map((row) => row.text[DESCRIPTION_COLUMN - 1] ?? '');

beforeAll(async () => {
  ledger = await signedInLedger('phase-6-export@ripis.test');

  const wallet = async (name: string, currencyId: string): Promise<string> => {
    const response = await createWallet(
      ledger.request('/api/wallets', { method: 'POST', body: { name, walletType: 'cash', currencyId, openingBalance: '0' } }),
      undefined,
    );
    const answer = await response.text();

    expect(response.status, answer).toBe(201);

    return (JSON.parse(answer) as { id: string }).id;
  };

  tstWalletId = await wallet('Cash TST', CURRENCIES.base.code);
  ts0WalletId = await wallet('Zero TST', CURRENCIES.zeroDecimal.code);
  foodId = await category('Export Food');

  await record({
    transactionType: 'expense',
    occurredOn: '2026-08-01',
    walletId: tstWalletId,
    categoryId: foodId,
    amount: '25000',
    baseAmount: '25000',
    description: 'august first',
    notes: 'bought in bulk',
  });

  await record({
    transactionType: 'expense',
    occurredOn: '2026-08-15',
    walletId: ts0WalletId,
    categoryId: foodId,
    amount: '120000',
    baseAmount: '1200000',
    description: 'zero decimal',
  });

  // The row whose actor is swapped below: recorded by this ledger's user, attributed in the audit log to
  // somebody else, so the export has to say who the audit log says did it.
  const transferId = await record({
    transactionType: 'transfer',
    occurredOn: '2026-08-20',
    walletId: tstWalletId,
    destinationWalletId: ts0WalletId,
    amount: '1000',
    destinationAmount: '10000',
    baseAmount: '1000',
    description: 'august transfer',
  });

  const actor = await prisma.user.create({
    data: {
      name: ACTOR_NAME,
      email: ACTOR_EMAIL,
      password_hash: 'not-a-real-hash',
      primary_currency_id: CURRENCIES.base.code,
    },
  });

  await prisma.$executeRaw`
    UPDATE public.audit_log
    SET actor_user_id = ${actor.id}::uuid
    WHERE entity_id = ${transferId}::uuid AND action = 'created'
  `;

  await record({
    transactionType: 'expense',
    occurredOn: '2026-08-31',
    walletId: tstWalletId,
    categoryId: foodId,
    amount: '31000',
    baseAmount: '31000',
    description: 'august last',
  });

  // Outside the exported month, either side of it, entered today like everything else.
  await record({
    transactionType: 'expense',
    occurredOn: '2026-07-15',
    walletId: tstWalletId,
    categoryId: foodId,
    amount: '15000',
    baseAmount: '15000',
    description: 'july row',
  });

  await record({
    transactionType: 'expense',
    occurredOn: '2026-09-01',
    walletId: tstWalletId,
    categoryId: foodId,
    amount: '1000',
    baseAmount: '1000',
    description: 'september row',
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: ACTOR_EMAIL } });
  await closeLedger(ledger);
  await teardownTestData();
});

describe('the Excel export', () => {
  it('writes the nine columns of §12, one row per transaction in the range, oldest first', async () => {
    const response = await exportFile(AUGUST);

    expect(response.status).toBe(200);

    const rows = await rowsOf(response);

    expect(rows[0]?.text).toEqual([...EXPORT_HEADERS]);

    expect(rows.slice(1).map((row) => row.text)).toEqual([
      ['2026-08-01', 'expense', 'Export Food', 'Cash TST', '25000.0000', 'TST', 'august first', 'bought in bulk', OWNER_NAME],
      ['2026-08-15', 'expense', 'Export Food', 'Zero TST', '120000.0000', 'TS0', 'zero decimal', '', OWNER_NAME],
      ['2026-08-20', 'transfer', '', 'Cash TST', '1000.0000', 'TST', 'august transfer', '', ACTOR_NAME],
      ['2026-08-31', 'expense', 'Export Food', 'Cash TST', '31000.0000', 'TST', 'august last', '', OWNER_NAME],
    ]);
  });

  it('writes money as text, so no spreadsheet can reformat the figure', async () => {
    const rows = await rowsOf(await exportFile(AUGUST));
    const written = rows.slice(1);

    expect(written.map((row) => row.text[AMOUNT_COLUMN - 1])).toEqual([
      '25000.0000',
      '120000.0000',
      '1000.0000',
      '31000.0000',
    ]);

    for (const row of written) {
      expect(row.amountType).toBe(ExcelJS.ValueType.String);
    }
  });

  it('reads the amount and the currency from the row itself, not from the base figures', async () => {
    // The zero-decimal row carries 120,000 in its own currency and 1,200,000 base: the file has to show the
    // figures the wallets actually hold, in the currency they hold them in.
    const rows = await rowsOf(await exportFile(AUGUST));
    const zeroDecimal = rows.slice(1).find((row) => row.text[DESCRIPTION_COLUMN - 1] === 'zero decimal');

    expect(zeroDecimal?.text[AMOUNT_COLUMN - 1]).toBe('120000.0000');
    expect(zeroDecimal?.text[EXPORT_HEADERS.indexOf('Currency')]).toBe('TS0');
  });

  it('selects on occurred_on, so a past month exports rows entered today', async () => {
    const rows = await rowsOf(await exportFile(AUGUST));
    const descriptions = descriptionsOf(rows);

    expect(descriptions).toEqual(['august first', 'zero decimal', 'august transfer', 'august last']);
    expect(descriptions).not.toContain('july row');
    expect(descriptions).not.toContain('september row');
  });

  it('treats both ends of the range as part of it', async () => {
    const first = await rowsOf(await exportFile({ startDate: '2026-08-01', endDate: '2026-08-01' }));
    const last = await rowsOf(await exportFile({ startDate: '2026-08-31', endDate: '2026-08-31' }));
    const day = await rowsOf(await exportFile({ startDate: '2026-08-15', endDate: '2026-08-15' }));

    expect(descriptionsOf(first)).toEqual(['august first']);
    expect(descriptionsOf(last)).toEqual(['august last']);
    expect(descriptionsOf(day)).toEqual(['zero decimal']);
  });

  it('says who did it, reading the actor out of the audit log', async () => {
    const rows = await rowsOf(await exportFile(AUGUST));
    const byDescription = new Map(rows.slice(1).map((row) => [row.text[DESCRIPTION_COLUMN - 1], row.text[CREATED_BY_COLUMN - 1]]));

    expect(byDescription.get('august transfer')).toBe(ACTOR_NAME);
    expect(byDescription.get('august first')).toBe(OWNER_NAME);
  });

  it('exports an empty month as a valid file with headers and nothing else', async () => {
    const response = await exportFile({ startDate: '2026-02-01', endDate: '2026-02-28' });
    const rows = await rowsOf(response);

    expect(response.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toEqual([...EXPORT_HEADERS]);
  });

  it('names the file after its range and types it as a spreadsheet', async () => {
    const response = await exportFile(AUGUST);

    expect(response.headers.get('content-type')).toBe(XLSX_CONTENT_TYPE);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="ripis-transactions-2026-08-01~2026-08-31.xlsx"',
    );
  });

  it('records the export in the audit log as a file, not as a row', async () => {
    const before = await exportedFiles();

    await exportFile(AUGUST);

    expect(await exportedFiles()).toBe(before + 1);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { user_id: ledger.userId, entity_type: 'export', action: 'exported' },
      orderBy: { created_at: 'desc' },
    });

    // The subject is the file, so there is no row to point at.
    expect(entry.entity_id).toBeNull();
    expect(entry.after_value).toMatchObject({
      kind: 'xlsx',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      rows: 4,
    });
  });

  it(`exports the caller's rows and nobody else's`, async () => {
    const neighbour = await signedInLedger('phase-6-export-neighbour@ripis.test');

    try {
      const walletResponse = await createWallet(
        neighbour.request('/api/wallets', {
          method: 'POST',
          body: { name: 'Neighbour Cash', walletType: 'cash', currencyId: CURRENCIES.base.code, openingBalance: '0' },
        }),
        undefined,
      );
      expect(walletResponse.status).toBe(201);
      const walletId = ((await walletResponse.json()) as { id: string }).id;

      const categoryResponse = await createCategory(
        neighbour.request('/api/categories', {
          method: 'POST',
          body: { name: 'Neighbour Food', type: 'expense', color: '#D22129' },
        }),
        undefined,
      );
      expect(categoryResponse.status).toBe(201);
      const categoryId = ((await categoryResponse.json()) as { id: string }).id;

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

      const descriptions = descriptionsOf(await rowsOf(await exportFile(AUGUST)));

      expect(descriptions).toContain('august first');
      expect(descriptions).not.toContain('neighbour august');
    } finally {
      await closeLedger(neighbour);
    }
  });

  it('refuses a field it does not have, a missing range and a date it cannot read', async () => {
    expect((await exportFile({ ...AUGUST, page: '1' })).status).toBe(400);
    // §12 gives the export a date range and nothing else, so a field the list endpoint does take is refused
    // here rather than silently narrowing the file.
    expect((await exportFile({ ...AUGUST, walletId: '00000000-0000-0000-0000-000000000000' })).status).toBe(400);
    expect((await exportFile({ startDate: '2026-08-01' })).status).toBe(400);
    expect((await exportFile({ startDate: 'not-a-date', endDate: '2026-08-31' })).status).toBe(400);
  });
});

/** A category the fixture's rows can point at. */
async function category(name: string): Promise<string> {
  const response = await createCategory(
    ledger.request('/api/categories', { method: 'POST', body: { name, type: 'expense', color: '#D22129' } }),
    undefined,
  );
  const answer = await response.text();

  expect(response.status, answer).toBe(201);

  return (JSON.parse(answer) as { id: string }).id;
}

/** How many exports this ledger has on the audit log so far. */
async function exportedFiles(): Promise<number> {
  return prisma.auditLog.count({
    where: { user_id: ledger.userId, entity_type: 'export', action: 'exported' },
  });
}