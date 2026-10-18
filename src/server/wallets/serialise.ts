import type { Wallet } from '@prisma/client';

import { money } from '../money/amount';
import { value } from '../money/direction';

/**
 * The wallet in its wire shape — the camelCase form of the model, mapped here and nowhere else
 * (`02-context.md` §6 says the mapping belongs in the server module that owns the field, and a mapping
 * performed inside a route handler is a defect).
 *
 * Three things this shape decides, each of them a rule rather than a preference:
 *
 * - **`currentBalance` and `value` are both sent.** The stored balance is what the statement says; the
 *   value is what net worth sees. Sending only the balance would have a screen compute the other one,
 *   and §2 says the client never computes money.
 * - **`value` is computed by `direction.ts`**, never here. The sign of a liability is applied in one
 *   module, and this function would be the second place if it did the arithmetic itself.
 * - **Money is a string**, so `"1250000.0000"` and never `1250000`. A `number` on the wire is precision
 *   this application spent a schema decision refusing to lose.
 */
export interface WalletResponse {
  id: string;
  name: string;
  walletType: Wallet['wallet_type'];
  isLiability: boolean;
  currencyId: string;
  openingBalance: string;
  currentBalance: string;
  value: string;
  institution: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function serialiseWallet(wallet: Wallet): WalletResponse {
  return {
    id: wallet.id,
    name: wallet.name,
    walletType: wallet.wallet_type,
    isLiability: wallet.is_liability,
    currencyId: wallet.currency_id,
    openingBalance: money(wallet.opening_balance),
    currentBalance: money(wallet.current_balance),
    value: money(value(wallet, wallet.current_balance)),
    institution: wallet.institution,
    notes: wallet.notes,
    active: wallet.active,
    createdAt: wallet.created_at.toISOString(),
    updatedAt: wallet.updated_at.toISOString(),
  };
}
