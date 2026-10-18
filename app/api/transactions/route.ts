import { withCaller } from '../../../src/server/auth/require-user';
import {
  readJsonObject,
  readOptionalString,
  readOptionalStringArray,
  readString,
  rejectUnknownFields,
} from '../../../src/server/http/request';
import { createTransaction } from '../../../src/server/transactions/create-transaction';
import { listTransactions } from '../../../src/server/transactions/read-transactions';

/**
 * Transactions (FR-01–FR-04, FR-13).
 *
 * The route parses and delegates (ADR-0039). Every rule about what a transaction may be — the four types
 * and what each one forbids, a positive amount, a category that matches its type, a base amount that is
 * stated rather than derived from a rate — lives in `src/server/transactions/prepare.ts`, because the
 * import path and the transaction form call the same module rather than re-deriving it.
 */
const CREATE_FIELDS = [
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

export const GET = withCaller(async (request) => {
  const query = new URL(request.url).searchParams;
  const number = (name: string): number | undefined => {
    const raw = query.get(name);

    return raw === null || raw === '' ? undefined : Number(raw);
  };

  const page = await listTransactions({
    from: query.get('from') ?? undefined,
    to: query.get('to') ?? undefined,
    type: query.get('type') ?? undefined,
    walletId: query.get('walletId') ?? undefined,
    categoryId: query.get('categoryId') ?? undefined,
    tag: query.get('tag') ?? undefined,
    search: query.get('search') ?? undefined,
    page: number('page'),
    perPage: number('perPage'),
    includeDeleted: query.get('includeDeleted') === 'true',
  });

  return Response.json(page);
});

export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, CREATE_FIELDS);

  const created = await createTransaction({
    actor: caller,
    transactionType: readString(body, 'transactionType'),
    occurredOn: readString(body, 'occurredOn'),
    walletId: readString(body, 'walletId'),
    amount: readString(body, 'amount'),
    destinationWalletId: readOptionalString(body, 'destinationWalletId'),
    categoryId: readOptionalString(body, 'categoryId'),
    destinationAmount: readOptionalString(body, 'destinationAmount'),
    baseAmount: readOptionalString(body, 'baseAmount'),
    description: readOptionalString(body, 'description'),
    notes: readOptionalString(body, 'notes'),
    tags: readOptionalStringArray(body, 'tags'),
    merchant: readOptionalString(body, 'merchant'),
    location: readOptionalString(body, 'location'),
    project: readOptionalString(body, 'project'),
    receiptNumber: readOptionalString(body, 'receiptNumber'),
  });

  return Response.json(created, { status: 201 });
});
