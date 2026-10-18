import type { Wallet } from '@prisma/client';

import { db } from '../db';
import { ApiError } from '../http/errors';

/**
 * Reading one wallet that must exist, and must be the caller's.
 *
 * Every scoped query is already restricted to the caller by the extension (ADR-0020), so a wallet
 * belonging to somebody else is not found rather than found-and-refused. That is deliberate and
 * matches §6.1: another user's resource is a `404`, so the API never confirms that an id exists.
 *
 * Soft-deleted wallets are excluded here rather than at each call site. A deleted wallet that a
 * transaction could still point at would be a live parent of a history row, and the pickers are
 * supposed to be the only thing that notices a deletion.
 */
export async function findWallet(id: string): Promise<Wallet | null> {
  return db.wallet.findFirst({ where: { id, deleted_at: null } });
}

export async function requireWallet(id: string): Promise<Wallet> {
  const wallet = await findWallet(id);

  if (wallet === null) {
    throw new ApiError('wallet_not_found', 404, 'No such wallet.');
  }

  return wallet;
}
