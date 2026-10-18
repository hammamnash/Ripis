import type { Caller } from '../context';
import { ApiError } from '../http/errors';
import { readOptionalString, readOptionalStringArray } from '../http/request';
import type { NewTransaction } from './prepare';

/**
 * Turning a request body into the fields a transaction edit may name (FR-06).
 *
 * This is the third place a body is read rather than the route, and it is here for the same reason as the
 * other two: "which fields may this request name" is a rule about the ledger, not about HTTP. A route that
 * filtered the body first would put half of it in the transport layer, where the next endpoint would not
 * inherit it (ADR-0039).
 *
 * What is **not** patchable is as deliberate as what is. `currencyId` and `baseCurrencyId` are consequences
 * of the wallets involved and the caller's primary currency, never inputs; `id` and `recordedAt` are the
 * ledger's own. A body naming any of them is refused by name rather than ignored, so a client cannot send a
 * field it believes is doing something.
 */
const EDITABLE = [
  'transactionType',
  'occurredOn',
  'walletId',
  'destinationWalletId',
  'categoryId',
  'amount',
  'destinationAmount',
  'baseAmount',
  'description',
  'notes',
  'tags',
  'merchant',
  'location',
  'project',
  'receiptNumber',
];

function text(edit: Record<string, unknown>, field: string) {
  return readOptionalString(edit, field);
}

export function readTransactionEdit(body: Record<string, unknown>, actor: Caller): Partial<NewTransaction> {
  if (Object.keys(body).length === 0) {
    throw new ApiError('validation_failed', 400, 'Nothing to change.');
  }

  const edit: Partial<NewTransaction> = { actor };
  const known: Record<string, string> = {
    transactionType: 'transactionType',
    occurredOn: 'occurredOn',
    walletId: 'walletId',
    destinationWalletId: 'destinationWalletId',
    categoryId: 'categoryId',
    amount: 'amount',
    destinationAmount: 'destinationAmount',
    baseAmount: 'baseAmount',
    description: 'description',
    notes: 'notes',
    tags: 'tags',
    merchant: 'merchant',
    location: 'location',
    project: 'project',
    receiptNumber: 'receiptNumber',
  };

  for (const field of Object.keys(body)) {
    if (!(field in known)) {
      throw new ApiError(
        field.startsWith('currency') || field === 'recordedAt' || field === 'id'
          ? 'immutable_field'
          : 'validation_failed',
        400,
        `${field} cannot be set on a transaction.`,
        field,
      );
    }
  }

  for (const field of EDITABLE) {
    if (!(field in body)) continue;

    if (field === 'tags') {
      edit.tags = readOptionalStringArray(body, 'tags');
      continue;
    }

    const value = text(body, field);
    if (value !== undefined) {
      // The money and date fields are validated by `prepareTransaction` on the merged row rather than here,
      // so there is exactly one place that decides what an amount or a calendar date may be.
      (edit as Record<string, unknown>)[field] = value;
    }
  }

  return edit;
}
