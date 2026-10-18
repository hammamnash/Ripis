import { withCaller } from '../../../../src/server/auth/require-user';
import { readJsonObject } from '../../../../src/server/http/request';
import { getWallet } from '../../../../src/server/wallets/list-wallets';
import { deleteWallet } from '../../../../src/server/wallets/remove-wallet';
import { updateWallet } from '../../../../src/server/wallets/update-wallet';

/**
 * One wallet (FR-08).
 *
 * `PATCH` hands the parsed body straight to `updateWallet` rather than picking fields out of it here.
 * That is deliberate: the rule this endpoint enforces is *which fields a wallet edit may name* — three
 * of them are immutable — and a route that filtered the body before delegating would hold half of that
 * rule in the transport layer, where the next endpoint would not inherit it (ADR-0039).
 *
 * `DELETE` is a soft delete (ADR-0005) and it is not a re-run of the archive: it takes the wallet out of
 * the lists while its transactions stay exactly where they are, still counting toward the months they
 * belong to. See `remove-wallet.ts` for why those two acts are different.
 */
export const GET = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, _authenticated, context) => {
    const { id } = await context.params;
    const wallet = await getWallet(id);

    if (wallet === null) {
      return Response.json(
        { error: { code: 'not_found', message: 'No such wallet.' } },
        { status: 404 },
      );
    }

    return Response.json(wallet);
  },
);

export const PATCH = withCaller<{ params: Promise<{ id: string }> }>(
  async (request, { caller }, context) => {
    const { id } = await context.params;
    const body = await readJsonObject(request);

    return Response.json(await updateWallet({ actor: caller, id, body }));
  },
);

export const DELETE = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, { caller }, context) => {
    const { id } = await context.params;

    return Response.json(await deleteWallet({ actor: caller, id }));
  },
);
