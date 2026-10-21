import type { CategoryType, TxType } from '@prisma/client';
import ExcelJS from 'exceljs';

import { CASHBOOK_LITERALS, cashbookHeaders } from '../export/cashbook';
import { ApiError } from '../http/errors';
import { money, parseAmount } from '../money/amount';
import { calendarDate } from '../time/calendar-date';

/**
 * Reading §12's cashbook shape back in (FR-12, Task 6.5) — the half that makes ADR-0008 a guarantee.
 *
 * The exporter writes a file that is the ledger's own shape rendered per-account; this module turns that
 * file back into the transactions it came from. `ADR-0008` states the property the pair has to satisfy:
 * **export → reimport → identical balances, wallets and totals.** Until this module existed the export was
 * one-way, so the formats could drift apart and nothing would notice until somebody tried to move their
 * history — which is what the round-trip spec asserts instead.
 *
 * Three decisions carry the whole mapping, and each one is a place where a plausible shortcut is wrong.
 *
 * **A pair is matched by its counterparties, never by its timestamp.** The reference file pairs a
 * transfer's legs by the instant they share, and 5 of its 1,062 transfer timestamps carry more than one
 * pair — so an instant is not an identity, and the reference's own pairing was ambiguous in exactly those
 * five places. The export avoids the ambiguity by writing the *other* wallet's name into `Category`, and
 * this module reads that: a `Transfer-Out` row of `Hutang` naming `Cash VND` is the partner of the
 * `Transfer-In` row of `Cash VND` naming `Hutang` whose column 6 and foreign leg agree.
 *
 * **`amount` is the source leg's own value, not the file's `Amount` column.** `Amount`/`Currency` hold the
 * side that is *not* in the primary currency (see `foreignLeg`), which is the source leg only when the
 * source wallet is the foreign one. The stored `amount` is the source wallet's leg in the source wallet's
 * currency — `prepare.ts` derives `currency_id` from the wallet — so `amount` comes from the source row's
 * `Accounts2` and the currency comes from the wallet. Reading the file's `Amount` column into `amount`
 * would put a VND figure in an IDR column for every transfer that left the primary currency, and it would
 * look exactly like a correct row.
 *
 * **A wallet's currency is inferred only where the file actually says it, and refused otherwise.** This is
 * the one thing the shape cannot always carry: for a cross-currency transfer the file names the foreign
 * leg, so a pair whose *neither* wallet holds the primary currency leaves the destination's currency
 * unwritten. §12's own example has one leg in the primary currency, and a same-currency transfer names it
 * twice, so the common cases resolve; the rest are refused by name rather than guessed, because a wrong
 * currency here is a wrong total everywhere.
 *
 * `recorded_at` is not restored: a row records when it was written (ADR-0007), so an import stamps its own
 * instant. `Period` therefore does not survive a round trip, and the spec says so rather than asserting a
 * fidelity the model does not have.
 */

/** §12's four literals, in the order the file may hold them. */
const LITERALS: string[] = [
  CASHBOOK_LITERALS.expense,
  CASHBOOK_LITERALS.income,
  CASHBOOK_LITERALS.transferOut,
  CASHBOOK_LITERALS.transferIn,
];

/** The instant a `Period` cell names. Number cells are refused: a serial is a date only with a workbook's setting. */
const PERIOD_AS_TEXT = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

/** One row of the file, with the columns this shape uses mapped to what they say. */
export interface CashbookRow {
  /** 1-based sheet row, for error messages that can be found in the file. */
  row: number;
  period: Date;
  accounts: string;
  category: string;
  note: string;
  /** Column 6: the row's frozen value in the primary currency. */
  primaryValue: string;
  literal: string;
  description: string;
  /** Column 9: the foreign leg — the side that is not in the primary currency. */
  amount: string;
  currency: string;
  /** Column 11: the value of *this* row's wallet, in that wallet's currency. */
  accounts2: string;
}

export interface ParsedCashbook {
  /** Column 6's header: the currency the file's figures are frozen in. */
  primaryCurrency: string;
  rows: CashbookRow[];
}

export interface PlannedWallet {
  name: string;
  currencyId: string;
}

export interface PlannedCategory {
  name: string;
  type: CategoryType;
}

/** One transaction to write, in the file's own order. Every field is a wire value: `prepareTransaction` owns the rest. */
export interface PlannedWrite {
  transactionType: TxType;
  /** `YYYY-MM-DD`, read from the row's `Period` — the shape has no separate date column (§12). */
  occurredOn: string;
  walletName: string;
  destinationWalletName: string | null;
  categoryName: string | null;
  amount: string;
  destinationAmount: string | null;
  baseAmount: string;
  description: string | null;
  notes: string | null;
}

export interface CashbookPlan {
  primaryCurrency: string;
  wallets: PlannedWallet[];
  categories: PlannedCategory[];
  writes: PlannedWrite[];
  /** The file's rows, which is not the writes: a transfer is one transaction and two rows. */
  rows: number;
  /** Earliest and latest `occurred_on` the file holds, as the summary reports them. */
  from: string;
  to: string;
}

/**
 * ExcelJS hands a cell back as one of a dozen shapes — a value, a formula and its result, rich text, a
 * date, an error — and every one of them is a real thing a spreadsheet contains.
 *
 * Unwrapping here rather than at each column keeps each column's check about the value it needs (text,
 * a number, an instant) instead of about the workbook's representation of it. An error cell becomes an
 * object that no column accepts, which is a refusal naming the cell.
 */
function unwrap(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'object' && !(value instanceof Date)) {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return (value as { result?: unknown }).result ?? null;
    if ('text' in value) return String((value as { text: unknown }).text);
  }

  return value;
}

function failure(message: string): ApiError {
  return new ApiError('validation_failed', 400, message);
}

/**
 * A cell that has to be text. A number is accepted and read as its own digits, because a spreadsheet
 * turns `2026` in a note into one, and refusing that would refuse a file the reference format allows.
 * Nothing is trimmed: a description is what the person wrote, and the exporter wrote it verbatim.
 */
function text(value: unknown, where: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value === null) return '';

  throw failure(`${where} must be text.`);
}

/**
 * A money cell: the exact 4-dp string the round trip needs, and **both** of the shapes the format has ever
 * held. The exporter writes strings (ADR-0057) and the reference file holds numbers, so a number cell is
 * converted by its own digits and handed to the same parser as everything else — never to `Number()`, and
 * never rounded on the way (`money/amount.ts` refuses a fifth decimal place rather than silently keeping
 * four, which is the same rule at the same boundary).
 */
function decimal(value: unknown, where: string): string {
  if (typeof value === 'string' && value.trim() !== '') return money(parseAmount(value.trim(), where));
  if (typeof value === 'number' && Number.isFinite(value)) return money(parseAmount(String(value), where));

  throw failure(`${where} must be a number.`);
}

function absoluteMoney(value: string, where: string): string {
  return money(parseAmount(value, where).abs());
}

/** A `Period` cell: the instant the entry was written. A date cell is read as it stands, text names UTC. */
function instant(value: unknown, where: string): Date {
  if (value instanceof Date) return value;

  if (typeof value === 'string' && PERIOD_AS_TEXT.test(value)) {
    // Read as UTC because the file's date cell carries no zone: the exporter derived it from a `timestamptz`
    // the same way, so a round trip does not drift by an hour and change which day a row lands on.
    return new Date(`${value.slice(0, 10)}T${value.slice(11)}Z`);
  }

  throw failure(`${where} must be a date and a time, written as YYYY-MM-DD HH:MM:SS.`);
}

/**
 * The file as rows, or a refusal that names the cell that is wrong.
 *
 * Every check here is about the *shape* — the eleven columns, the four literals, four-decimal money — and
 * none of them is about whether the rows make sense together. Pairing and currency resolution are
 * `planCashbook`'s job, because they need the whole file.
 */
export async function readCashbook(buffer: Buffer): Promise<ParsedCashbook> {
  const workbook = new ExcelJS.Workbook();

  try {
    // ExcelJS's own `Buffer` type, as the export specs do: the library declares the writable-buffer shape and
    // Node's `Buffer` is assignable in practice, not in the type system.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw failure('That file is not a spreadsheet this app can read.');
  }

  const sheet = workbook.worksheets[0];
  if (sheet === undefined) throw failure('That file has no sheet in it.');

  const header = sheet.getRow(1);
  const primaryCurrency = text(unwrap(header.getCell(6).value), 'row 1, column 6').trim();

  if (primaryCurrency === '') {
    throw failure('Row 1, column 6 has to be headed with the currency this file is written in.');
  }

  const expected = cashbookHeaders(primaryCurrency);

  // Compared against the exporter's own header function rather than a second copy of the list: the shape is
  // one definition, and a file written by this application is the one that must always be readable.
  for (let column = 1; column <= expected.length; column += 1) {
    const found = text(unwrap(header.getCell(column).value), `row 1, column ${column}`).trim();
    const wanted = expected[column - 1];

    if (found !== wanted) {
      throw failure(
        `Row 1, column ${column} is headed ${found === '' ? 'nothing' : `"${found}"`}, and the cashbook shape says "${wanted ?? ''}".`,
      );
    }
  }

  for (let column = expected.length + 1; column <= sheet.columnCount; column += 1) {
    const extra = text(unwrap(header.getCell(column).value), `row 1, column ${column}`).trim();

    if (extra !== '') {
      throw failure(`Row 1, column ${column} is headed "${extra}", and the cashbook shape has ${expected.length} columns.`);
    }
  }

  const rows: CashbookRow[] = [];

  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const values = expected.map((_, offset) => unwrap(row.getCell(offset + 1).value));
    const blank = values.every((value) => value === null || (typeof value === 'string' && value.trim() === ''));

    if (blank) continue;

    const at = (column: number, name: string) => `row ${index}, column ${column} (${name})`;
    const literal = text(values[6], at(7, 'Income/Expense')).trim();

    if (!LITERALS.includes(literal)) {
      throw failure(
        `Row ${index}: Income/Expense says ${literal === '' ? 'nothing' : `"${literal}"`}, and this shape holds only ` +
          `${LITERALS.map((value) => `"${value}"`).join(', ')}. A row with any other word in it cannot be totalled, ` +
          'and guessing which one it meant is how a file quietly changes a total.',
      );
    }

    rows.push({
      row: index,
      period: instant(values[0], at(1, 'Period')),
      accounts: text(values[1], at(2, 'Accounts')).trim(),
      category: text(values[2], at(3, 'Category')).trim(),
      note: text(values[4], at(5, 'Note')),
      primaryValue: decimal(values[5], at(6, primaryCurrency)),
      literal,
      description: text(values[7], at(8, 'Description')),
      amount: decimal(values[8], at(9, 'Amount')),
      currency: text(values[9], at(10, 'Currency')).trim(),
      accounts2: decimal(values[10], at(11, 'Accounts2')),
    });

    // `Subcategory` (column 4) is deliberately not read: §12's mapping skips it, the model has one level of
    // category (ADR-0014), and the exporter writes it empty. Reading it would mean inventing somewhere to put it.
  }

  return { primaryCurrency, rows };
}

function skipSelfTransfers(rows: CashbookRow[]): CashbookRow[] {
  const skipped = rows.filter(
    (row) =>
      (row.literal === CASHBOOK_LITERALS.transferIn || row.literal === CASHBOOK_LITERALS.transferOut) &&
      row.accounts !== '' &&
      row.accounts === row.category,
  );

  if (skipped.length === 0) return rows;

  return rows.filter((row) => !skipped.includes(row));
}
function splitAmbiguousWalletNames(rows: CashbookRow[], primaryCurrency: string): CashbookRow[] {
  const ordinary = new Map<string, Set<string>>();
  const renamedCurrency = new Map<number, string>();

  for (const row of rows) {
    if (row.literal !== CASHBOOK_LITERALS.expense && row.literal !== CASHBOOK_LITERALS.income) continue;
    const currencies = ordinary.get(row.accounts) ?? new Set<string>();
    currencies.add(row.currency);
    ordinary.set(row.accounts, currencies);
    renamedCurrency.set(row.row, row.currency);
  }

  const ambiguous = new Set([...ordinary.entries()].filter(([, currencies]) => currencies.size > 1).map(([name]) => name));
  if (ambiguous.size === 0) return rows;

  const knownCurrency = new Map<string, string>();
  for (const [name, currencies] of ordinary) {
    if (currencies.size === 1) {
      const only = [...currencies][0];
      if (only !== undefined) knownCurrency.set(name, only);
    }
  }

  for (const [out, into] of pairsOf(rows)) {
    const outCurrency = out.accounts2 === out.primaryValue ? primaryCurrency : out.currency;
    const intoCurrency = into.accounts2 === into.primaryValue ? primaryCurrency : into.currency;
    renamedCurrency.set(out.row, knownCurrency.get(out.accounts) ?? outCurrency);
    renamedCurrency.set(into.row, knownCurrency.get(into.accounts) ?? intoCurrency);
  }

  const renamed = new Map<number, CashbookRow>();
  for (const row of rows) {
    const currency = renamedCurrency.get(row.row);
    renamed.set(row.row, currency !== undefined && ambiguous.has(row.accounts)
      ? { ...row, accounts: `${row.accounts} ${currency}` }
      : row);
  }

  for (const [out, into] of pairsOf(rows)) {
    const outRow = renamed.get(out.row);
    const intoRow = renamed.get(into.row);
    if (outRow === undefined || intoRow === undefined) continue;
    if (ambiguous.has(out.category)) outRow.category = `${out.category} ${renamedCurrency.get(into.row) ?? into.currency}`;
    if (ambiguous.has(into.category)) intoRow.category = `${into.category} ${renamedCurrency.get(out.row) ?? out.currency}`;
  }

  return rows.map((row) => renamed.get(row.row) ?? row);
}

/**
 * Every wallet in the file with the currency the file says it holds — and a refusal for any wallet the file
 * does not say it for.
 * wallet's currency in `Currency`, because for those rows the file's `Amount` *is* that wallet's leg. A
 * transfer pair names the leg that is not in the primary currency, so which wallet that is has to be worked
 * out from the pair — and that is the whole of `pairCurrencies`.
 */
function walletCurrencies(rows: CashbookRow[], primaryCurrency: string): Map<string, string> {
  const found = new Map<string, string>();

  const claim = (name: string, currencyId: string, where: string) => {
    const held = found.get(name);

    if (held !== undefined && held !== currencyId) {
      throw failure(
        `${where} says the wallet "${name}" holds ${currencyId}, and another row of the file says it holds ${held}. ` +
          'One wallet has one currency, so this file was not written from a single ledger.',
      );
    }

    found.set(name, currencyId);
  };

  for (const row of rows) {
    if (row.accounts === '') {
      throw failure(`Row ${row.row}, column 2 (Accounts) has to name the wallet the entry belongs to.`);
    }

    if (row.currency === '') {
      throw failure(`Row ${row.row}, column 10 (Currency) has to name a currency.`);
    }
  }

  // Ordinary rows identify their wallet currency directly. Resolve those first so a transfer whose foreign
  // leg is the primary currency can inherit the destination wallet's currency from the rest of the file.
  for (const row of rows) {
    if (row.literal === CASHBOOK_LITERALS.expense || row.literal === CASHBOOK_LITERALS.income) {
      claim(row.accounts, row.currency, `Row ${row.row}`);
    }
  }

  for (const [out, into] of pairsOf(rows)) {
    // Nothing is re-checked here about the two rows agreeing: `pairsOf` matches on the instant, the
    // counterparties, column 6, the foreign leg, the note and the description together, so a pair that reached
    // this line already agrees about all of them. A row whose column 6 disagrees with its partner's is not a
    // pair at all, and is reported as a row whose other half is missing.
    const foreign = out.currency;

    if (foreign === primaryCurrency) {
      // The foreign leg is labelled with the primary currency in this shape. Use Accounts2 versus column 6
      // to identify which side is primary; the other wallet's currency must come from another row in the file.
      // When both sides agree (a same-currency transfer, or neither leg matching column 6), both wallets claim
      // the label; a later row or the conflicting-claim check resolves any disagreement.
      const outHoldsPrimary = out.accounts2 === out.primaryValue;
      const intoHoldsPrimary = into.accounts2 === into.primaryValue;

      if (outHoldsPrimary === intoHoldsPrimary) {
        claim(out.accounts, primaryCurrency, `Row ${out.row}`);
        claim(into.accounts, primaryCurrency, `Row ${into.row}`);
      } else if (outHoldsPrimary) {
        claim(out.accounts, primaryCurrency, `Row ${out.row}`);
      } else {
        claim(into.accounts, primaryCurrency, `Row ${into.row}`);
      }
      continue;
    }

    const outHoldsPrimary = out.accounts2 === out.primaryValue;
    const intoHoldsPrimary = into.accounts2 === into.primaryValue;

    if (outHoldsPrimary && intoHoldsPrimary) {
      throw failure(
        `Rows ${out.row} and ${into.row} both carry the ${primaryCurrency} figure of the transfer (${out.primaryValue}), ` +
          'and only one side of it can be in that currency. Which wallet holds it cannot be read from the file.',
      );
    }

    if (outHoldsPrimary) {
      // The source leg is the primary one, so `Currency` names the destination's currency.
      claim(out.accounts, primaryCurrency, `Row ${out.row}`);
      claim(into.accounts, foreign, `Row ${into.row}`);
      continue;
    }

    // The source is the foreign leg — `foreignLeg` names the source whenever the source is not the primary one,
    // which is what makes this the one side that is always readable.
    claim(out.accounts, foreign, `Row ${out.row}`);

    if (intoHoldsPrimary) {
      claim(into.accounts, primaryCurrency, `Row ${into.row}`);
    }
    // Otherwise the destination holds a third currency that no column of this pair states, and `resolve` below
    // refuses by name unless another row of the file says what it holds.
  }

  for (const row of rows) {
    if (row.literal === CASHBOOK_LITERALS.expense || row.literal === CASHBOOK_LITERALS.income) {
      claim(row.accounts, row.currency, `Row ${row.row}`);
    }
  }

  return found;
}

/**
 * The file's transfer rows, as pairs: every `Transfer-Out` with the `Transfer-In` that is its other half.
 *
 * The partner is found by the counterparties the export writes into `Category` plus everything the two rows
 * must agree on, and **never by the instant alone**. Two transfers forced onto one instant are the case that
 * separates the two: a timestamp-keyed matcher would hand each out-row whichever in-row it met first, and the
 * ledger it built would still balance — which is why the reference history's five ambiguous timestamps are
 * worth reproducing in a fixture rather than reasoning about.
 */
function pairsOf(rows: CashbookRow[]): [CashbookRow, CashbookRow][] {
  const key = (row: CashbookRow) =>
    JSON.stringify([
      row.period.toISOString(),
      row.accounts,
      row.category,
      row.primaryValue,
      row.amount,
      row.currency,
      row.note,
      row.description,
    ]);

  // Mirrored: the out row names the other wallet where the in row names itself, so swapping the two fields is
  // what turns one half of a pair into a lookup key for the other.
  const mirrored = (row: CashbookRow) =>
    JSON.stringify([
      row.period.toISOString(),
      row.category,
      row.accounts,
      row.primaryValue,
      row.amount,
      row.currency,
      row.note,
      row.description,
    ]);

  const waiting = new Map<string, CashbookRow[]>();

  for (const row of rows) {
    if (row.literal !== CASHBOOK_LITERALS.transferIn) continue;

    const bucket = waiting.get(key(row)) ?? [];
    bucket.push(row);
    waiting.set(key(row), bucket);
  }

  const pairs: [CashbookRow, CashbookRow][] = [];

  for (const row of rows) {
    if (row.literal !== CASHBOOK_LITERALS.transferOut) continue;

    const bucket = waiting.get(mirrored(row));
    const partner = bucket?.pop();

    if (partner === undefined) {
      throw failure(
        `Row ${row.row} is a ${CASHBOOK_LITERALS.transferOut} of "${row.accounts}" to "${row.category}" at ${row.period.toISOString()}, ` +
          `and the file holds no matching ${CASHBOOK_LITERALS.transferIn} in "${row.category}". A transfer is two rows, ` +
          'and one of them is missing.',
      );
    }

    pairs.push([row, partner]);
  }

  for (const [, remaining] of waiting) {
    for (const row of remaining) {
      throw failure(
        `Row ${row.row} is a ${CASHBOOK_LITERALS.transferIn} in "${row.accounts}" from "${row.category}", and the file holds no ` +
          `matching ${CASHBOOK_LITERALS.transferOut} in "${row.category}".`,
      );
    }
  }

  return pairs;
}

/**
 * The file as the transactions to write, or a refusal.
 *
 * The order is the file's own: rows are read in the order they appear, a pair is emitted where its out-row
 * sits, and nothing is sorted. Re-running an import of the same file therefore writes the same ledger, and a
 * person comparing two files against the same ledger sees the same order in both.
 */
export function planCashbook(parsed: ParsedCashbook, ledgerPrimaryCurrency: string): CashbookPlan {
  if (parsed.rows.length === 0) {
    throw failure('That file has no entries in it, so there is nothing to import.');
  }

  if (parsed.primaryCurrency !== ledgerPrimaryCurrency) {
    // Column 6 is frozen in the currency the *writing* ledger used (`base_currency_id`), and the figure is
    // stated, not converted. Importing an IDR cashbook into a TST account would freeze IDR figures into TST
    // ones and every total in the account would be wrong from then on — so the two have to agree.
    throw failure(
      `This file's column 6 is headed ${parsed.primaryCurrency}, and this account's primary currency is ` +
        `${ledgerPrimaryCurrency}. The figures in column 6 are frozen, not converted, so they cannot be ` +
        'imported into an account that does not hold them.',
    );
  }

  const rows = skipSelfTransfers(parsed.rows);
  const rowsWithSplitWallets = splitAmbiguousWalletNames(rows, parsed.primaryCurrency);
  const currencies = walletCurrencies(rowsWithSplitWallets, parsed.primaryCurrency);
  const pairs = pairsOf(rowsWithSplitWallets);

  const writes: PlannedWrite[] = [];
  const byOutRow = new Map<number, CashbookRow>();

  for (const [out, into] of pairs) byOutRow.set(out.row, into);

  for (const row of rowsWithSplitWallets) {
    const where = `row ${row.row}`;

    if (row.literal === CASHBOOK_LITERALS.transferIn) {
      // Emitted with its out-row, which the file's order puts first for every pair the exporter wrote.
      continue;
    }

    if (row.literal === CASHBOOK_LITERALS.transferOut) {
      const into = byOutRow.get(row.row);

      if (into === undefined) throw failure(`${where} is a transfer whose other half is missing.`);

      const sourceCurrency = currencyOf(currencies, row.accounts, row.row);
      const destinationCurrency = currencyOf(currencies, into.accounts, into.row);
      const sameCurrency = sourceCurrency === destinationCurrency;

      // `prepare.ts` refuses a destination amount when both wallets hold one currency ("nothing for a second
      // amount to say"), and requires one when they differ — so the type and the second amount are decided
      // together, and the file cannot carry the distinction: both are one transfer with one pair of rows.
      writes.push({
        transactionType: sameCurrency ? 'transfer' : 'exchange',
        occurredOn: calendarDate(row.period),
        walletName: row.accounts,
        destinationWalletName: into.accounts,
        categoryName: null,
        amount: row.accounts2,
        destinationAmount: sameCurrency ? null : into.accounts2,
        baseAmount: row.primaryValue,
        description: emptyToNull(row.description),
        notes: emptyToNull(row.note),
      });

      continue;
    }

    if (row.category === '') {
      // The exporter writes an empty `Category` only for a transaction that had none, and `prepare.ts` requires
      // one for income and expense — so this is a file this application could not have written, and the row it
      // points at has no category to be filed under. Inventing one would change the ledger's breakdown silently.
      throw failure(
        `${where} is a ${row.literal} in "${row.accounts}" with no category in column 3. An income or an expense ` +
          'has to have one, so this row cannot be imported as it stands.',
      );
    }

    const sourceAmount = parseAmount(row.accounts2, `${where}, column 11 (Accounts2)`);
    const sourceBase = parseAmount(row.primaryValue, `${where}, column 6 (${parsed.primaryCurrency})`);

    if (sourceAmount.isZero() || sourceBase.isZero()) {
      throw failure(`${where} has a zero money value, and a zero transaction cannot be imported.`);
    }

    const positive = sourceAmount.greaterThan(0);
    const transactionType =
      row.literal === CASHBOOK_LITERALS.expense
        ? positive
          ? 'expense'
          : 'income'
        : positive
          ? 'income'
          : 'expense';

    writes.push({
      transactionType,
      occurredOn: calendarDate(row.period),
      walletName: row.accounts,
      destinationWalletName: null,
      categoryName: row.category,
      amount: absoluteMoney(row.accounts2, `${where}, column 11 (Accounts2)`),
      destinationAmount: null,
      baseAmount: absoluteMoney(row.primaryValue, `${where}, column 6 (${parsed.primaryCurrency})`),
      description: emptyToNull(row.description),
      notes: emptyToNull(row.note),
    });
  }

  const wallets: PlannedWallet[] = [...currencies.entries()]
    .map(([name, currencyId]) => ({ name, currencyId }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const categories = categoriesOf(writes);
  const days = parsed.rows.map((row) => calendarDate(row.period)).sort();

  return {
    primaryCurrency: parsed.primaryCurrency,
    wallets,
    categories,
    writes,
    rows: rowsWithSplitWallets.length,
    from: days[0] ?? '',
    to: days[days.length - 1] ?? '',
  };
}

/**
 * The wallet for a paired row, or a refusal that says what the file would have had to contain.
 *
 * This is the honest edge of the shape. §12's mapping names one leg and infers the other from the column-6
 * figure, so a pair whose two wallets are both foreign to the primary currency leaves the destination's
 * currency nowhere in the file. A refusal naming the wallet is the only answer that cannot silently file
 * money under the wrong currency.
 */
function currencyOf(currencies: Map<string, string>, name: string, row: number): string {
  const currency = currencies.get(name);

  if (currency === undefined) {
    throw failure(
      `Row ${row} moves money through the wallet "${name}", and no row of this file says what currency that ` +
        'wallet holds. A transfer names only the leg that is not in the primary currency, so the wallet at the ' +
        'other end of this pair has to appear in a row of its own for the import to know its currency.',
    );
  }

  return currency;
}

/**
 * An absent value, as the model holds it.
 *
 * The shape has no way to tell `null` from `''` — the exporter renders both as an empty cell — and the model
 * has one convention, which is `null`. Reading them back as `''` would store something the application never
 * writes itself, and every later comparison of "no note" against "an empty note" would disagree.
 */
function emptyToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

/** The categories the writes need, deduplicated by name and type — the pair the database makes unique. */
function categoriesOf(writes: PlannedWrite[]): PlannedCategory[] {
  const seen = new Map<string, PlannedCategory>();

  for (const write of writes) {
    if (write.categoryName === null) continue;

    const type: CategoryType = write.transactionType === 'expense' ? 'expense' : 'income';
    seen.set(`${type}:${write.categoryName}`, { name: write.categoryName, type });
  }

  return [...seen.values()].sort((left, right) =>
    left.name === right.name ? left.type.localeCompare(right.type) : left.name.localeCompare(right.name),
  );
}
