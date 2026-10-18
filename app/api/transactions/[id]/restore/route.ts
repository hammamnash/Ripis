import { withCaller } from '../../../../../src/server/auth/require-user';
import { restoreTransaction } from '../../../../../src/server/transactions/update-transaction';

/**
 * Putting a soft-deleted transaction back (FR-05, Task 3.8).
 *
 * A correction of a mistake rather than a new event: the row is unchanged and only the balances it touched
 * are rebuilt. Restoring is the one write that reads a row the list filters hide, which is why it does not
 * go through the ordinary reader.
 */
export const POST = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, { caller }, context) => {
    const { id } = await context.params;

    return Response.json(await restoreTransaction({ actor: caller, id }));
  },
);
