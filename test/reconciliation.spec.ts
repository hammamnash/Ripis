import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as createCategory } from '../app/api/categories/route';
import { POST as reconcileRoute } from '../app/api/reconciliation/route';
import { POST as createWallet } from '../app/api/wallets/route';
import { runAsCaller, type Caller } from '../src/server/context';
import { BALANCE_DIFFERENCE } from '../src/server/reconciliation/reconcile';
import { monthSummary } from '../src/server/reports/month-summary';
import { recomputeBalance } from '../src/server/wallets/balance';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 3.10 — the reconciliation direction table (FR-09, ADR-0017, ADR-0025).
 *
 * This is the spec the phase is most likely to need and least likely to enjoy. The rule is that the
 * *transaction type* of a reconciliation is derived from which way the wallet's **value** has to move, and
 * on a liability that is the opposite of the obvious answer:
 *
 * | wallet | ledger says | statement says | direction | stored balance |
 * |---|---|---|---|---|
 * | asset | −50 | 0 | `income` | 0 |
 * | asset | 0 | −50 | `expense` | −50 |
 * | card | 0 | 500 000 of debt | `expense` | **+500 000** |
 * | card | 500 000 of debt | 400 000 | `income` | **−500 000, i.e. 400 000** |
 *
 * The two card rows are the whole point: the correction that *reduces* net worth is an `expense` even
 * though it increases the stored balance, and a module that got this wrong would move the balance to
 * exactly the figure the user did not type.
 */
const EMAIL = 'phase-3-reconcile@ripis.test';

let ledger: SpecLedger;
let caller: Caller;

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
  caller = { id: ledger.userId, role: 'user' };
});

afterAll(async () => {
  await closeLedger(ledger);
  await teardownTestData();
  await prisma.$disconnect();
});

async function wallet(name: string, isLiability: boolean, opening: string): Promise<string> {
  const response = await createWallet(
    ledger.request('/api/wallets', {
      method: 'POST',
      body: {
        name,
        walletType: isLiability ? 'credit_card' : 'cash',
        currencyId: 'TST',
        openingBalance: opening,
      },
    }),
    undefined,
  );

  return ((await response.json()) as { id: string }).id;
}

async function category(type: 'income' | 'expense'): Promise<string> {
  const response = await createCategory(
    ledger.request('/api/categories', {
      method: 'POST',
      body: { name: `Adjust ${type} ${Math.random().toString(36).slice(2, 8)}`, type, color: '#D22129' },
    }),
    undefined,
  );

  return ((await response.json()) as { id: string }).id;
}

async function reconcile(walletId: string, actualBalance: string, type: 'income' | 'expense') {
  const response = await reconcileRoute(
    ledger.request('/api/reconciliation', {
      method: 'POST',
      body: {
        walletId,
        actualBalance,
        occurredOn: '2026-10-31',
        categoryId: await category(type),
      },
    }),
    undefined,
  );

  return {
    status: response.status,
    body: (await response.json()) as {
      direction?: 'income' | 'expense';
      differenceValue?: string;
      transaction?: { notes: string | null; amount: string; transactionType: string };
      error?: { code: string };
    },
  };
}

const stored = async (walletId: string): Promise<string> =>
  (
    await prisma.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { current_balance: true } })
  ).current_balance.toFixed(4);

const computed = (walletId: string) => runAsCaller(caller, () => recomputeBalance(walletId));

describe('the direction is derived from value, and a liability inverts it', () => {
  it('on an asset, closing a gap upwards is income', async () => {
    // The ledger says −50 because a transaction was recorded that the statement does not have.
    const cash = await wallet('Asset below', false, '-50.0000');

    const result = await reconcile(cash, '0.0000', 'income');

    expect(result.status).toBe(200);
    expect(result.body.direction).toBe('income');
    expect(result.body.differenceValue).toBe('50.0000');
    expect(await stored(cash)).toBe('0.0000');
  });

  it('on an asset, closing a gap downwards is expense', async () => {
    const cash = await wallet('Asset above', false, '0.0000');

    const result = await reconcile(cash, '-50.0000', 'expense');

    expect(result.status).toBe(200);
    expect(result.body.direction).toBe('expense');
    expect(result.body.differenceValue).toBe('-50.0000');
    expect(await stored(cash)).toBe('-50.0000');
  });

  it('on a card, debt that the ledger does not know about is an expense — and it raises the balance', async () => {
    const card = await wallet('Card with unnoticed debt', true, '0.0000');

    const result = await reconcile(card, '500000.0000', 'expense');

    expect(result.status).toBe(200);
    expect(result.body.direction).toBe('expense');
    // Stated the way the statement states it, stored the way the rule stores it.
    expect(await stored(card)).toBe('500000.0000');
    expect((await computed(card)).toFixed(4)).toBe('500000.0000');
  });

  it('on a card, debt that disappeared is an income — and it lowers the balance', async () => {
    const card = await wallet('Card paid down', true, '500000.0000');

    const result = await reconcile(card, '400000.0000', 'income');

    expect(result.status).toBe(200);
    expect(result.body.direction).toBe('income');
    expect(await stored(card)).toBe('400000.0000');
    expect((await computed(card)).toFixed(4)).toBe('400000.0000');
  });
});

describe('a reconciliation is an ordinary income or expense row (ADR-0017)', () => {
  it('writes the note exactly, counts in the month, and moves value by the difference', async () => {
    const cash = await wallet('Asset for the totals', false, '0.0000');
    const before = await runAsCaller(caller, () => monthSummary('2026-10'));

    const result = await reconcile(cash, '-300000.0000', 'expense');

    expect(result.status).toBe(200);
    expect(result.body.transaction?.notes).toBe(BALANCE_DIFFERENCE);
    expect(result.body.transaction?.transactionType).toBe('expense');

    // It counts toward expense like anything else — its note is its only marker, and there is no
    // "exclude reconciliations" filter anywhere (ADR-0017).
    const after = await runAsCaller(caller, () => monthSummary('2026-10'));
    expect(Number(after.expense) - Number(before.expense)).toBe(300000);
    expect(after.counts.expense - before.counts.expense).toBe(1);
    expect(result.body.differenceValue).toBe('-300000.0000');
  });

  it('refuses a statement that already matches, and writes nothing', async () => {
    const cash = await wallet('Asset already matching', false, '12345.0000');
    const rowsBefore = await prisma.transaction.count({ where: { user_id: ledger.userId } });

    const result = await reconcile(cash, '12345.0000', 'income');

    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe('balance_already_matches');
    expect(await prisma.transaction.count({ where: { user_id: ledger.userId } })).toBe(rowsBefore);
  });

  it('refuses a category of the wrong type rather than swapping it', async () => {
    const cash = await wallet('Asset for wrong category', false, '0.0000');

    // The value has to rise, so the row is an income — and an expense category cannot file it.
    const result = await reconcile(cash, '1000.0000', 'expense');

    expect(result.status).toBe(400);
    expect(result.body.error?.code).toBe('category_type_mismatch');
  });
});
