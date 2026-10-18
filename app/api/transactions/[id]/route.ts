import { withCaller } from '../../../../src/server/auth/require-user';
import { readJsonObject } from '../../../../src/server/http/request';
import { getTransaction } from '../../../../src/server/transactions/read-transactions';
import { readTransactionEdit } from '../../../../src/server/transactions/patch';
import {
  deleteTransaction,
  updateTransaction,
} from '../../../../src/server/transactions/update-transaction';

/**
 * One transaction (FR-06).
 *
 * `PATCH` hands the body to `readTransactionEdit`, which owns which fields a transaction may name — and
 * which it may not. `currencyId` and `baseCurrencyId` are consequences of the wallets and the caller's
 * primary currency rather than inputs, so a body naming them is refused rather than ignored.
 *
 * `DELETE` is a soft delete (ADR-0005) and rebuilds the balances it touched, so the money a removed
 * transaction moved stops being counted the moment it stops being listed. The row stays, and
 * `POST …/restore` puts it back.
 */
export const GET = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, _authenticated, context) => {
    const { id } = await context.params;
    const transaction = await getTransaction(id);

    if (transaction === null) {
      return Response.json(
        { error: { code: 'not_found', message: 'No such transaction.' } },
        { status: 404 },
      );
    }

    return Response.json(transaction);
  },
);

export const PATCH = withCaller<{ params: Promise<{ id: string }> }>(
  async (request, { caller }, context) => {
    const { id } = await context.params;
    const body = await readJsonObject(request);

    return Response.json(
      await updateTransaction({ actor: caller, id, edit: readTransactionEdit(body, caller) }),
    );
  },
);

export const DELETE = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, { caller }, context) => {
    const { id } = await context.params;

    return Response.json(await deleteTransaction({ actor: caller, id }));
  },
);
