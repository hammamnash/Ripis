import ExcelJS from 'exceljs';

import { writeAudit } from '../audit';
import type { Caller } from '../context';
import { db } from '../db';
import { money } from '../money/amount';
import { calendarDate, parseCalendarDate } from '../time/calendar-date';
import { XLSX_CONTENT_TYPE, xlsxBuffer, type ExportRange, type ExportedFile } from './file';

/**
 * The Excel export of §12 (FR-12, Task 6.3).
 *
 * **The range filters `occurred_on`, and the file's Date column renders the same field.** §12's warning is
 * about a file *selected* by one date and *rendered* from another — `recorded_at` is an audit timestamp and
 * can be a different month from the entry it records (ADR-0007), so a September export whose rows showed
 * October dates would look like a bug in the ledger rather than in the export.
 *
 * **Money is a string cell, not a number cell.** The value is the exact 4-dp decimal (`125000.0000`), and a
 * numeric cell invites Excel to apply its own format, round on display, or reinterpret a large value in
 * scientific notation. `Number()` anywhere near money is the defect §10 names, and a spreadsheet cell is one
 * more place it can happen.
 *
 * **"Created By" is the actor from the audit log, not the owner of the row.** They are the same person for a
 * row the user entered themselves, and they differ for a row an admin entered on their behalf — which is the
 * whole reason §14 exists (ADR-0046). Reading the owner instead would produce a plausible column that is
 * wrong exactly when it matters.
 *
 * The export writes one `exported` audit row (§14), with no `entity_id`: the subject is the file, not a row.
 */
export const EXPORT_HEADERS = [
  'Date',
  'Type',
  'Category',
  'Wallet',
  'Amount',
  'Currency',
  'Description',
  'Notes',
  'Created By',
] as const;

/** Who created each of these transactions, according to the audit log rather than the row's owner. */
async function creatorsOf(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const entries = await db.auditLog.findMany({
    where: { entity_type: 'transaction', entity_id: { in: ids }, action: 'created' },
    select: { entity_id: true, actor_user_id: true },
  });

  // `User` is outside the scoping extension, so this read names the rows it means rather than relying on a
  // filter that is not there — an unfiltered read here returns somebody else's name (ADR-0043).
  const actorIds = [...new Set(entries.map((entry) => entry.actor_user_id))];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));

  return new Map(
    entries.flatMap((entry) =>
      entry.entity_id === null ? [] : [[entry.entity_id, names.get(entry.actor_user_id) ?? ''] as const],
    ),
  );
}

export async function exportXlsx(actor: Caller, range: ExportRange): Promise<ExportedFile> {
  const from = parseCalendarDate(range.startDate, 'startDate');
  const to = parseCalendarDate(range.endDate, 'endDate');

  const rows = await db.transaction.findMany({
    where: { deleted_at: null, occurred_on: { gte: from, lte: to } },
    orderBy: [{ occurred_on: 'asc' }, { recorded_at: 'asc' }],
    include: { wallet: true, category: true },
  });

  const creators = await creatorsOf(rows.map((row) => row.id));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Transactions');

  sheet.addRow([...EXPORT_HEADERS]);

  for (const row of rows) {
    sheet.addRow([
      // A calendar date string, not a `Date` object: a date cell is rendered through Excel's own format and
      // a locale, and this column means the day that was recorded in the ledger, exactly as stored.
      calendarDate(row.occurred_on),
      // The stored type, verbatim. §12's four literals (`Exp.`, `Income`, `Transfer-Out`, `Transfer-In`)
      // belong to the cashbook shape, where a transfer is two rows; writing them here would blur two formats
      // that ADR-0008 keeps apart.
      row.transaction_type,
      row.category?.name ?? '',
      row.wallet.name,
      money(row.amount),
      row.currency_id,
      row.description ?? '',
      row.notes ?? '',
      creators.get(row.id) ?? '',
    ]);
  }

  const buffer = await xlsxBuffer(workbook);

  await writeAudit({
    actor,
    userId: actor.id,
    entityType: 'export',
    action: 'exported',
    after: { kind: 'xlsx', startDate: range.startDate, endDate: range.endDate, rows: rows.length },
  });

  return {
    buffer,
    filename: `ripis-transactions-${range.startDate}~${range.endDate}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    rows: rows.length,
  };
}
