import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { money } from '../money/amount';
import { requireWallet } from './get-wallet';
import { serialiseWallet, type WalletResponse } from './serialise';

/**
 * Archiving and soft-deleting a wallet — two different acts that both take a wallet out of the way.
 *
 * The line between them is `02-context.md` §3's: **an inactive wallet stays in history and out of
 * pickers, a soft-deleted one leaves the lists.** Archiving is what a user does to a wallet they have
 * stopped using; deleting is what they do to one they created by mistake.
 *
 * Neither touches the wallet's transactions. A transaction is a record of something that happened, and
 * it keeps naming the wallet it happened in; deleting the wallet would otherwise have to delete the
 * history, which is the one thing this application never does to money (ADR-0005). So the transactions
 * stay, they keep counting toward the months they belong to, and the wallet simply stops being offered.
 *
 * Both writes go through `writeAudited`, so each appends exactly one row (§14, FR-14) — and the delete's
 * row is what makes the deletion answerable later, since the row itself is still there with a
 * `deleted_at` on it.
 */
export async function archiveWallet(input: { actor: Caller; id: string }): Promise<WalletResponse> {
  const before = await requireWallet(input.id);

  return writeAudited({
    actor: input.actor,
    entityType: 'wallet',
    action: 'archived',
    before: { active: before.active },
    run: async (tx) => {
      const wallet = await tx.wallet.update({ where: { id: input.id }, data: { active: false } });

      return { written: wallet, entityId: wallet.id, after: { active: wallet.active } };
    },
  }).then(serialiseWallet);
}

export async function deleteWallet(input: { actor: Caller; id: string }): Promise<{ status: 'ok' }> {
  const before = await requireWallet(input.id);

  await writeAudited({
    actor: input.actor,
    entityType: 'wallet',
    action: 'deleted',
    before: { name: before.name, current_balance: money(before.current_balance) },
    run: async (tx) => {
      const wallet = await tx.wallet.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });

      return {
        written: wallet,
        entityId: wallet.id,
        after: { deleted_at: wallet.deleted_at?.toISOString() ?? null },
      };
    },
  });

  // `{status: 'ok'}` rather than the deleted wallet: a deletion removes the thing from its own
  // representation, and returning the row invites a client to keep rendering it. The audit row is what
  // makes the act answerable afterwards.
  return { status: 'ok' };
}
