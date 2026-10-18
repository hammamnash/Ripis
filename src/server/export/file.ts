import type ExcelJS from 'exceljs';

/**
 * What both exports have in common: they answer with a spreadsheet (§12, FR-12).
 *
 * There are two of them — the transaction list (Task 6.3) and the cashbook (Task 6.4) — and they are
 * different shapes of the same kind of answer. The media type, the shape of the result and the conversion
 * from a workbook to bytes are identical, so they live here rather than in one of the two: an export that
 * answered with a different content type, or with a `Buffer` on one path and a blob on the other, would be
 * a difference nobody intended and no test would be looking for.
 */

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The range both exports take, named for the request body's fields so a validation error points at them. */
export interface ExportRange {
  /** `YYYY-MM-DD`, inclusive of the day it names. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive — the whole of the last day is inside the range. */
  endDate: string;
}

export interface ExportedFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
  /** The rows the file contains, which is what the audit entry records as having left the system. */
  rows: number;
}

/**
 * A finished workbook as bytes.
 *
 * `writeBuffer` hands back an `ArrayBuffer`, and `Buffer.from` over it does **not** copy a view of it —
 * passing the `ArrayBuffer` straight to `Response` later works in Node but not reliably in every runtime,
 * so the conversion happens once, here, and every export gets the same object type back.
 */
export async function xlsxBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(new Uint8Array(await workbook.xlsx.writeBuffer()));
}
