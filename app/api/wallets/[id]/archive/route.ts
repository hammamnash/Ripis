import { withCaller } from '../../../../../src/server/auth/require-user';
import { archiveWallet } from '../../../../../src/server/wallets/remove-wallet';

/**
 * Archiving a wallet (FR-08).
 *
 * A verb rather than `PATCH {active: false}`, and both exist on purpose: `PATCH` can bring a wallet back
 * (`{"active": true}`), so this route is the one-way convenience a list screen's archive button calls
 * without having to know the field name. It is not a delete — the wallet keeps its transactions, its
 * balance and its place in history; it stops being offered in a picker.
 */
export const POST = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, { caller }, context) => {
    const { id } = await context.params;

    return Response.json(await archiveWallet({ actor: caller, id }));
  },
);
