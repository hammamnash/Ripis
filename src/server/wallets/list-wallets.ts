import { db } from '../db';
import { serialiseWallet, type WalletResponse } from './serialise';

/**
 * The wallets a screen offers (FR-08).
 *
 * Two switches, both off by default, and the defaults are the interesting part: a picker wants wallets
 * that are live and in use, so `includeArchived` is what a settings screen passes to see the archived
 * ones, and `includeDeleted` is what nothing passes today — it exists because the only way to be sure a
 * filter is doing what it claims is to be able to ask for the rows it hides.
 *
 * Ordering is stable rather than alphabetical: active wallets first, oldest first within each group. A
 * list that reorders itself when a wallet is archived makes the archive button feel like it moved
 * something else.
 *
 * One encoding note that belongs here rather than in a client: `value` is computed per wallet from
 * `is_liability` (ADR-0025), so a card's value is negative while its balance is positive. The wire
 * carries both, because they answer different questions.
 */
export interface WalletListOptions {
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export async function listWallets(options: WalletListOptions = {}): Promise<WalletResponse[]> {
  const wallets = await db.wallet.findMany({
    where: {
      deleted_at: options.includeDeleted ? undefined : null,
      active: options.includeArchived ? undefined : true,
    },
    orderBy: [{ active: 'desc' }, { created_at: 'asc' }],
  });

  return wallets.map(serialiseWallet);
}

export async function getWallet(id: string): Promise<WalletResponse | null> {
  const wallet = await db.wallet.findFirst({ where: { id, deleted_at: null } });

  return wallet === null ? null : serialiseWallet(wallet);
}
