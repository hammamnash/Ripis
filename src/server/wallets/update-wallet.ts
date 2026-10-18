import type { Prisma, Wallet } from '@prisma/client';

import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { ApiError } from '../http/errors';
import { readOptionalBoolean, readOptionalString } from '../http/request';
import { money } from '../money/amount';
import { requireWallet } from './get-wallet';
import { serialiseWallet, type WalletResponse } from './serialise';

/**
 * Editing a wallet (FR-08, ADR-0025, ADR-0015).
 *
 * Three fields are refused if the body mentions them at all, and each refusal is a rule rather than a
 * tidiness preference:
 *
 * - **`openingBalance`** — the figure every recomputed balance starts from. Changing it restates past
 *   months without touching a single transaction, so a wrong opening balance is corrected by an
 *   ordinary `income` or `expense` row noted as a balance difference, where it is visible in the month
 *   it happened (ADR-0017).
 * - **`currencyId`** — a wallet holds money in exactly one currency, and the `amount` on every one of
 *   its rows is denominated in it. Re-pointing the wallet would silently redenominate history.
 * - **`walletType`** — the type describes what the wallet *is*, and it is what the liability flag was
 *   read from. A wallet that changed kind is a new wallet.
 *
 * **`isLiability` is editable, and `walletType` is not consulted when it is.** That is ADR-0025's
 * explicit position: the flag pre-fills from the type once, at creation, and a later edit must not
 * re-derive it — a deliberate correction would otherwise be undone the next time anything touched the
 * row. So a PATCH naming only `isLiability` moves the wallet between the two halves of
 * `assets − liabilities` and nothing else changes, and a PATCH that also names `walletType` is refused
 * before any of it is written.
 *
 * The body is read here rather than in the route, because "which fields may this request name" *is* the
 * rule this module owns — a route that filtered the body first would put half the rule in the transport
 * layer, where the next endpoint would not inherit it.
 */
const IMMUTABLE = new Set(['openingBalance', 'currencyId', 'walletType']);

const MUTABLE = new Set(['name', 'isLiability', 'institution', 'notes', 'active']);

export interface WalletEdit {
  actor: Caller;
  id: string;
  body: Record<string, unknown>;
}

export async function updateWallet(edit: WalletEdit): Promise<WalletResponse> {
  for (const field of Object.keys(edit.body)) {
    if (IMMUTABLE.has(field)) {
      throw new ApiError(
        'immutable_field',
        400,
        `${field} cannot be changed after a wallet is created.`,
        field,
      );
    }

    if (!MUTABLE.has(field)) {
      throw new ApiError('validation_failed', 400, `${field} is not a wallet field.`, field);
    }
  }

  const before = await requireWallet(edit.id);

  // Typed as Prisma's own update input rather than a bare record: the field names here are the
  // model's, and a typo in one of them should be a compile error rather than a silent no-op that
  // reports success.
  const data: Prisma.WalletUpdateInput = {};

  // Read through the shared optional readers rather than inline checks, so a `PATCH /wallets/:id` and a
  // `PATCH /categories/:id` refuse a wrong-typed field with the same code, status and message.
  const name = readOptionalString(edit.body, 'name');
  if (name !== undefined) {
    if (name === null || name.trim() === '') {
      throw new ApiError('validation_failed', 400, 'name cannot be empty.', 'name');
    }
    data.name = name;
  }

  const isLiability = readOptionalBoolean(edit.body, 'isLiability');
  if (isLiability !== undefined) data.is_liability = isLiability;

  const active = readOptionalBoolean(edit.body, 'active');
  if (active !== undefined) data.active = active;

  const institution = readOptionalString(edit.body, 'institution');
  if (institution !== undefined) data.institution = institution;

  const notes = readOptionalString(edit.body, 'notes');
  if (notes !== undefined) data.notes = notes;

  if (Object.keys(data).length === 0) {
    throw new ApiError('validation_failed', 400, 'Nothing to change.');
  }

  const written = await writeAudited({
    actor: edit.actor,
    entityType: 'wallet',
    action: 'updated',
    before: auditView(before),
    run: async (tx) => {
      const wallet = await tx.wallet.update({ where: { id: edit.id }, data });

      return {
        written: wallet,
        entityId: wallet.id,
        after: auditView(wallet),
      };
    },
  });

  return serialiseWallet(written);
}

/** Money as a string, and only the fields a wallet edit can touch — never the whole row. */
function auditView(wallet: Wallet) {
  return {
    name: wallet.name,
    is_liability: wallet.is_liability,
    opening_balance: money(wallet.opening_balance),
    institution: wallet.institution,
    notes: wallet.notes,
    active: wallet.active,
  };
}
