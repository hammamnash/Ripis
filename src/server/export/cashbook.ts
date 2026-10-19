import { Prisma, type TxType } from '@prisma/client';
import ExcelJS from 'exceljs';

import { writeAudit } from '../audit';
import type { Caller } from '../context';
import { primaryCurrencyOf } from '../currency';
import { db } from '../db';
import { money } from '../money/amount';
import { parseCalendarDate } from '../time/calendar-date';
import { XLSX_CONTENT_TYPE, xlsxBuffer, type ExportRange, type ExportedFile } from './file';

/**
 * The cashbook export of §12 (FR-12, Task 6.4) — the **mandatory second shape** (ADR-0008).
 *
 * Ripis stores one transaction per event; this shape is per-*account*, so a transfer becomes two mirrored
 * rows that share a timestamp — a `Transfer-Out` in the wallet the money left and a `Transfer-In` in the
 * wallet it arrived in. Five years and 9,174 rows of history exist in this shape, and the format has to
 * round-trip (export → reimport → identical balances, wallets and totals), so the file is not a report about
 * the ledger; it is the ledger, written the way the reference wrote it.
 *
 * **Two rows are synthesised from one transaction, never joined back together.** The reference file pairs a
 * transfer's legs by their timestamp, and that is a trap: five timestamps in the real history carry more than
 * one transfer, so a timestamp is not an identity. Here the pairing is never inferred — the counterparty of
 * each row is read off the transaction that produced it, which is why `Category` holds the *other* wallet's
 * name rather than a category.
 *
 * **The range filters `occurred_on`; `Period` renders `recorded_at`.** These are the two dates §12 warns
 * about. A transfer that happened on 31 August but was keyed in on 3 September belongs in an August export,
 * and its `Period` says September, because `recorded_at` is what the reference's `Period` column has always
 * held — the instant the entry was written (ADR-0007).
 *
 * **Money is written as the exact 4-dp string, not as a number cell.** The reference file's money cells are
 * numbers, so the importer accepts both; the exporter does not write them. A number cell is a `double` a
 * spreadsheet is free to round on display, and `Decimal(19,4)` runs to nineteen significant digits, which a
 * `double` does not hold — §10 and ADR-0012 keep money away from `number` everywhere else, and a file is one
 * more place it would be lost (ADR-0057).
 *
 * Column 6 is the **primary-currency value** of the row and is headed with the ledger's primary currency
 * code — `IDR` for the reference ledger and for any IDR-primary one. FR-02 lets the primary currency be
 * edited without moving historical `base_amount`, so a ledger that has changed it will have older rows whose
 * column 6 is in the currency frozen on the row (`base_currency_id`) rather than the one in the header.
 */

/** §12's four literals. Anything that is not one of these is a row a spreadsheet will not total. */
export const CASHBOOK_LITERALS = {
  expense: 'Exp.',
  income: 'Income',
  transferOut: 'Transfer-Out',
  transferIn: 'Transfer-In',
} as const;

/**
 * §12's eleven columns, in the reference file's order.
 *
 * `Subcategory` is always empty: the reference has the column and the data model has no subcategories
 * (§10's category tree is one level), and an empty column is the honest form of a column that means
 * nothing yet.
 */
export function cashbookHeaders(primaryCurrency: string): string[] {
  return [
    'Period',
    'Accounts',
    'Category',
    'Subcategory',
    'Note',
    primaryCurrency,
    'Income/Expense',
    'Description',
    'Amount',
    'Currency',
    'Accounts2',
  ];
}

/** One row of the file. A transfer produces two of these; everything else produces one. */
interface CashbookRow {
  /** A `Date`, because the reference stores a timestamp here and the importer must read one back. */
  period: Date;
  accounts: string;
  category: string;
  note: string;
  /** Column 6: the row's frozen value in the primary currency. */
  primaryValue: string;
  literal: string;
  description: string;
  /** Column 9: the side that is not in the primary currency — see `foreignLeg`. */
  amount: string;
  currency: string;
  /** Column 11: the value of *this* leg, in the currency of the wallet this row belongs to. */
  accounts2: string;
}

/** A transaction, as the cashbook shape needs to see it. Structural, so the mapping can be tested on its own. */
export interface CashbookSource {
  transaction_type: TxType;
  amount: Prisma.Decimal;
  currency_id: string;
  destination_amount: Prisma.Decimal | null;
  base_amount: Prisma.Decimal;
  recorded_at: Date;
  description: string | null;
  notes: string | null;
  wallet: { name: string; currency_id: string };
  destination: { name: string; currency_id: string } | null;
  category: { name: string } | null;
}

/**
 * Which side of a transfer `Amount`/`Currency` names: **the side that is not in the primary currency**.
 *
 * §12's documented example is a `Hutang` → `Cash VND` transfer in an IDR-primary ledger: both rows carry
 * `5000000 VND`, because the IDR side is already column 6. When the source wallet is in the primary currency
 * the destination leg is named; otherwise the source leg is, including the case where neither leg is in the
 * primary currency — then the destination leg's value is still on the row, in `Accounts2`.
 */
function foreignLeg(
  source: CashbookSource,
  destination: { currency_id: string },
  primaryCurrency: string,
  destinationValue: string,
): { amount: string; currency: string } {
  if (source.currency_id === primaryCurrency) {
    return { amount: destinationValue, currency: destination.currency_id };
  }

  return { amount: money(source.amount), currency: source.currency_id };
}

/**
 * One stored transaction to the one or two rows this shape holds it as.
 *
 * Pure and exported so the mapping can be asserted against §12's own worked example without a database:
 * the shape is a contract, and the contract is what the tests should fail against.
 */
export function cashbookEntries(
  sources: CashbookSource[],
  primaryCurrency: string,
): CashbookRow[] {
  const entries: CashbookRow[] = [];

  for (const source of sources) {
    const destination = source.destination;

    if (source.transaction_type === 'transfer' || source.transaction_type === 'exchange') {
      if (destination === null) {
        throw new Error('a transfer without a destination wallet cannot be written as a cashbook row');
      }

      const destinationValue = money(source.destination_amount ?? source.amount);
      const foreign = foreignLeg(source, destination, primaryCurrency, destinationValue);

      entries.push({
        period: source.recorded_at,
        accounts: source.wallet.name,
        category: destination.name,
        note: source.notes ?? '',
        primaryValue: money(source.base_amount),
        literal: CASHBOOK_LITERALS.transferOut,
        description: source.description ?? '',
        amount: foreign.amount,
        currency: foreign.currency,
        accounts2: money(source.amount),
      });

      entries.push({
        period: source.recorded_at,
        accounts: destination.name,
        category: source.wallet.name,
        note: source.notes ?? '',
        primaryValue: money(source.base_amount),
        literal: CASHBOOK_LITERALS.transferIn,
        description: source.description ?? '',
        amount: foreign.amount,
        currency: foreign.currency,
        accounts2: destinationValue,
      });

      continue;
    }

    if (source.transaction_type === 'expense' || source.transaction_type === 'income') {
      const value = money(source.amount);

      entries.push({
        period: source.recorded_at,
        accounts: source.wallet.name,
        category: source.category?.name ?? '',
        note: source.notes ?? '',
        primaryValue: money(source.base_amount),
        literal:
          source.transaction_type === 'expense' ? CASHBOOK_LITERALS.expense : CASHBOOK_LITERALS.income,
        description: source.description ?? '',
        amount: value,
        currency: source.currency_id,
        accounts2: value,
      });

      continue;
    }

    throw new Error(`the cashbook shape has no row for a ${String(source.transaction_type)}`);
  }

  return entries;
}

export async function exportCashbook(actor: Caller, range: ExportRange): Promise<ExportedFile> {
  const from = parseCalendarDate(range.startDate, 'startDate');
  const to = parseCalendarDate(range.endDate, 'endDate');
  const primaryCurrency = await primaryCurrencyOf(actor);

  const sources = await db.transaction.findMany({
    where: { deleted_at: null, occurred_on: { gte: from, lte: to } },
    // By `Period`, which is what the file is read in — and a transfer's two rows are emitted together, so
    // they can never be separated by another transaction that shares their instant.
    orderBy: [{ recorded_at: 'asc' }, { occurred_on: 'asc' }, { id: 'asc' }],
    include: { wallet: true, destination: true, category: true },
  });

  const entries = cashbookEntries(sources, primaryCurrency);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cashbook');

  sheet.addRow(cashbookHeaders(primaryCurrency));

  for (const entry of entries) {
    const row = sheet.addRow([
      entry.period,
      entry.accounts,
      entry.category,
      // `Subcategory` — see `cashbookHeaders`.
      '',
      entry.note,
      entry.primaryValue,
      entry.literal,
      entry.description,
      entry.amount,
      entry.currency,
      entry.accounts2,
    ]);

    // The `Period` column holds a date, as it does in the reference file, and Excel's default date format is
    // a locale's idea of a date. Naming the format per cell keeps the instant readable and stable anywhere.
    row.getCell(1).numFmt = 'yyyy-mm-dd hh:mm:ss';
  }

  const buffer = await xlsxBuffer(workbook);

  await writeAudit({
    actor,
    userId: actor.id,
    entityType: 'export',
    action: 'exported',
    // `rows` is the rows in the file, not the transactions behind them: a transfer is one transaction and
    // two rows, and the audit answers what left the system.
    after: {
      kind: 'cashbook',
      startDate: range.startDate,
      endDate: range.endDate,
      rows: entries.length,
    },
  });

  return {
    buffer,
    filename: `ripis-cashbook-${range.startDate}~${range.endDate}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    rows: entries.length,
  };
}
