import { writeAudit } from '../audit';
import { createCategory } from '../categories/create-category';
import type { Caller } from '../context';
import { primaryCurrencyOf } from '../currency';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { createTransaction } from '../transactions/create-transaction';
import { prepareTransaction, type NewTransaction } from '../transactions/prepare';
import { createWallet } from '../wallets/create-wallet';
import { planCashbook, readCashbook, type CashbookPlan, type PlannedWrite } from './cashbook';

/**
 * Importing a cashbook file (FR-12, Task 6.5) — the write half, and the one that makes ADR-0008 true.
 *
 * Everything that decides *what* the file means lives in `./cashbook.ts` and runs before this module touches
 * the database. What is left here is the part that cannot be pure: resolving the file's names to the
 * caller's rows and writing through the same modules the endpoints call.
 *
 * **No rule is re-implemented here.** A transaction is written by `createTransaction`, which prepares it
 * through `prepareTransaction` — the same four-type table, the same "an amount is always positive", the same
 * `base_amount` rule, the same single writer of a wallet's balance (`ADR-0025`). A wallet is created by
 * `createWallet` and a category by `createCategory`, so an imported wallet gets the liability answer
 * `LIABILITY_PREFILL` gives its type rather than a second copy of that table, and an imported category is
 * subject to ADR-0030's colour rule and ADR-0014's one level. An importer that wrote these rows itself would
 * be a second place each of those decisions lives, and the two copies would drift.
 *
 * **Every row is prepared before any row is written.** `prepareTransaction` reads and decides; it writes
 * nothing. Running the whole plan through it first means a file whose fortieth row violates a rule leaves no
 * transactions behind — the failure a person would otherwise have to unpick by hand. It is not a transaction
 * over the whole import: the rows already written when a *later* row fails at the database are written, and
 * the audit row is not, which is stated here because it is a limit rather than a guarantee.
 *
 * **Three things the format does not carry, and what the import does about them.**
 *
 * - **An opening balance.** §12's eleven columns have no field for one, so an imported wallet opens at zero
 *   and its transactions are what move it. A round trip is therefore identical for everything the file
 *   holds, and a wallet whose *source* had an opening balance lands short by exactly that figure.
 * - **A wallet type, and therefore a liability flag.** The file names wallets and never types them, so an
 *   imported wallet is a `cash` one and takes `LIABILITY_PREFILL`'s answer — an asset. A credit card
 *   imported from a file is an asset wallet holding a positive balance, which is the one thing the file
 *   cannot tell us about it (ADR-0025), and the flag is a field the user can still set.
 * - **A wallet's identity beyond its name.** A pair of rows names its wallets by name, so two wallets that
 *   share a name are one wallet to the file. That is refused rather than merged into an arbitrary one of the
 *   two.
 */

/** An upload limit, stated rather than inherited: a cashbook of 9,174 rows is about 1.5 MB, and five years is not the ceiling. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Rows in the sheet, not transactions — a transfer is two. The real history is 9,174 rows; this leaves room. */
export const MAX_ROWS = 20000;

/**
 * The colour an imported category is given.
 *
 * ADR-0030 says a colour is the user's and is never assigned by rank or palette position, which is why
 * `createCategory` refuses a request that leaves one out. An import has nobody to ask, so it does not get to
 * choose a *meaningful* colour either: this is one neutral for every category it creates, and it is not a
 * colour the design names. The user can change it, and the alternative — refusing to import a file whose
 * categories do not exist yet — would make the round trip impossible on any ledger but the one it came from.
 */
export const IMPORTED_CATEGORY_COLOR = '#6B7280';

/** What the endpoint answers with: what the file was, and what the import added (FR-12). */
export interface ImportSummary {
  /** Rows in the file. */
  rows: number;
  /** Transactions written — a transfer's two rows are one. */
  transactions: number;
  /** Wallets this import created; the ones that already existed were reused. */
  walletsCreated: number;
  categoriesCreated: number;
  /** Earliest and latest `occurred_on` the file held, so the caller can see what arrived without opening it. */
  from: string;
  to: string;
}

/**
 * The file, as bytes.
 *
 * `Buffer.from(text, 'base64')` never throws and silently drops what it cannot decode, so an unreadable body
 * would arrive as a shorter buffer and fail somewhere further in with a message about a spreadsheet. The
 * length is checked before the decode and the decoded bytes are checked for the ZIP signature an `.xlsx` is,
 * which is the earliest place either can be said plainly.
 */
function decodeUpload(contentBase64: string): Buffer {
  const longest = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;

  if (contentBase64.length > longest) {
    throw new ApiError(
      'validation_failed',
      400,
      `That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB an import accepts.`,
      'contentBase64',
    );
  }

  const buffer = Buffer.from(contentBase64, 'base64');

  if (buffer.length === 0 || buffer.subarray(0, 2).toString('latin1') !== 'PK') {
    throw new ApiError('validation_failed', 400, 'contentBase64 must be a spreadsheet file, base64 encoded.', 'contentBase64');
  }

  return buffer;
}

interface Resolved {
  wallets: Map<string, string>;
  categories: Map<string, string>;
  walletsCreated: number;
  categoriesCreated: number;
}

/**
 * The file's wallet and category names as the caller's rows, creating what is missing.
 *
 * The lookups are by name because a name is all the file has: §12 carries no identifiers. A soft-deleted
 * wallet is not a wallet — its rows are hidden and its balance is out of every total — so the lookup filters
 * `deleted_at IS NULL` and an import that meets one creates a live wallet beside it rather than reviving it.
 */
async function resolveNames(actor: Caller, plan: CashbookPlan): Promise<Resolved> {
  const wantedCodes = [...new Set(plan.wallets.map((wallet) => wallet.currencyId))];
  const known = await db.currency.findMany({ where: { code: { in: wantedCodes } }, select: { code: true } });
  const knownCodes = new Set(known.map((currency) => currency.code));

  for (const wallet of plan.wallets) {
    if (!knownCodes.has(wallet.currencyId)) {
      throw new ApiError(
        'validation_failed',
        400,
        `The wallet "${wallet.name}" holds ${wallet.currencyId}, which is not a currency this app knows.`,
      );
    }
  }

  const existing = await db.wallet.findMany({
    where: { deleted_at: null, name: { in: plan.wallets.map((wallet) => wallet.name) } },
    select: { id: true, name: true, currency_id: true },
  });

  const wallets = new Map<string, string>();
  let walletsCreated = 0;

  for (const wallet of plan.wallets) {
    const matches = existing.filter((row) => row.name === wallet.name);

    if (matches.length > 1) {
      // The file identifies a wallet by its name and by nothing else, so two wallets with one name are one
      // wallet to the import. Picking either would put money in a wallet the user did not choose.
      throw new ApiError(
        'validation_failed',
        400,
        `This account has more than one wallet called "${wallet.name}", and a cashbook file names its wallets ` +
          'by name alone. Rename one of them and import again.',
      );
    }

    const match = matches[0];

    if (match !== undefined) {
      if (match.currency_id !== wallet.currencyId) {
        throw new ApiError(
          'validation_failed',
          400,
          `The wallet "${wallet.name}" in this account holds ${match.currency_id}, and the file says it holds ` +
            `${wallet.currencyId}. A wallet has one currency, so the file was not written from this account.`,
        );
      }

      wallets.set(wallet.name, match.id);
      continue;
    }

    const created = await createWallet({
      actor,
      name: wallet.name,
      // The format carries no wallet type, so the neutral asset type is the only honest answer; `isLiability` is
      // left to `LIABILITY_PREFILL` rather than restated here (ADR-0025).
      walletType: 'cash',
      currencyId: wallet.currencyId,
      openingBalance: '0',
    });

    wallets.set(wallet.name, created.id);
    walletsCreated += 1;
  }

  const categories = new Map<string, string>();
  let categoriesCreated = 0;

  if (plan.categories.length > 0) {
    const found = await db.category.findMany({
      where: { name: { in: plan.categories.map((category) => category.name) } },
      select: { id: true, name: true, type: true, archived_at: true },
    });

    for (const category of plan.categories) {
      const match = found.find((row) => row.name === category.name && row.type === category.type);

      if (match !== undefined) {
        if (match.archived_at !== null) {
          // `requireCategoryForType` refuses an archived category on a new transaction, so importing under one
          // would fail on a row in the middle of the file. Saying so here names the category and the fix.
          throw new ApiError(
            'validation_failed',
            400,
            `The ${category.type} category "${category.name}" is archived, and an archived category cannot be ` +
              'used on a new transaction. Restore it, or rename something, and import again.',
          );
        }

        categories.set(`${category.type}:${category.name}`, match.id);
        continue;
      }

      const created = await createCategory({
        actor,
        name: category.name,
        type: category.type,
        color: IMPORTED_CATEGORY_COLOR,
      });

      categories.set(`${category.type}:${category.name}`, created.id);
      categoriesCreated += 1;
    }
  }

  return { wallets, categories, walletsCreated, categoriesCreated };
}

/** A planned row as the create path's input — names turned into the ids it needs, and nothing else decided. */
function asInput(actor: Caller, write: PlannedWrite, resolved: Resolved): NewTransaction {
  const categoryId =
    write.categoryName === null
      ? null
      : resolved.categories.get(`${write.transactionType === 'expense' ? 'expense' : 'income'}:${write.categoryName}`);

  return {
    actor,
    transactionType: write.transactionType,
    occurredOn: write.occurredOn,
    walletId: requireId(resolved.wallets, write.walletName),
    destinationWalletId: write.destinationWalletName === null ? null : requireId(resolved.wallets, write.destinationWalletName),
    categoryId: categoryId ?? null,
    amount: write.amount,
    destinationAmount: write.destinationAmount,
    baseAmount: write.baseAmount,
    description: write.description,
    notes: write.notes,
  };
}

function requireId(ids: Map<string, string>, name: string): string {
  const id = ids.get(name);

  if (id === undefined) {
    throw new ApiError('validation_failed', 400, `The import could not resolve the wallet "${name}".`);
  }

  return id;
}

export interface ImportInput {
  /** Recorded in the audit row: which file was imported, as the person named it. */
  filename: string;
  contentBase64: string;
}

export async function importCashbook(actor: Caller, input: ImportInput): Promise<ImportSummary> {
  const buffer = decodeUpload(input.contentBase64);
  const parsed = await readCashbook(buffer);

  if (parsed.rows.length > MAX_ROWS) {
    throw new ApiError(
      'validation_failed',
      400,
      `That file holds ${parsed.rows.length} rows, and an import accepts ${MAX_ROWS}.`,
    );
  }

  const plan = planCashbook(parsed, await primaryCurrencyOf(actor));
  const resolved = await resolveNames(actor, plan);

  // Read-and-decide, for every row, before the first write: see the module comment.
  for (const write of plan.writes) {
    await prepareTransaction(asInput(actor, write, resolved));
  }

  for (const write of plan.writes) {
    await createTransaction(asInput(actor, write, resolved));
  }

  await writeAudit({
    actor,
    userId: actor.id,
    entityType: 'import',
    action: 'imported',
    // Model field names would be wrong here: an import is not a row of a table, so this is a statement about
    // the act — which file, and what it turned into.
    after: {
      kind: 'cashbook',
      filename: input.filename,
      rows: plan.rows,
      transactions: plan.writes.length,
      walletsCreated: resolved.walletsCreated,
      categoriesCreated: resolved.categoriesCreated,
      occurredFrom: plan.from,
      occurredTo: plan.to,
    },
  });

  return {
    rows: plan.rows,
    transactions: plan.writes.length,
    walletsCreated: resolved.walletsCreated,
    categoriesCreated: resolved.categoriesCreated,
    from: plan.from,
    to: plan.to,
  };
}
