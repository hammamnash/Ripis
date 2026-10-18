import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Transaction } from '../src/server/audit';
import { runAsCaller, type Caller } from '../src/server/context';
import { recomputeBalance, syncBalance } from '../src/server/wallets/balance';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 3.4 — `current_balance` is rebuilt from the rows that justify it, and rebuilds to the stored
 * figure exactly.
 *
 * The two halves of this are checked separately on purpose. `recomputeBalance` reads and writes nothing,
 * so it can be compared against the stored column afterwards — which is the acceptance criterion for the
 * task — and it is called through `runAsCaller`, so it goes through the same user-scoped client every
 * endpoint does rather than a bare `PrismaClient` that would see rows the app never can.
 *
 * The card case is the reason the task exists at all: on a liability the *stored* balance rises when the
 * user spends, so a recompute written for assets and reused for cards is off by twice the expense.
 */
const EMAIL = 'phase-3-balance@ripis.test';

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

/** Wallets and rows are created directly: this task is about arithmetic over rows, not about the routes. */
async function wallet(options: { name: string; isLiability: boolean; opening?: string }) {
  return prisma.wallet.create({
    data: {
      user_id: ledger.userId,
      name: options.name,
      wallet_type: options.isLiability ? 'credit_card' : 'cash',
      is_liability: options.isLiability,
      currency_id: 'TST',
      opening_balance: options.opening ?? '0.0000',
      current_balance: options.opening ?? '0.0000',
    },
  });
}

async function category() {
  return prisma.category.create({
    data: {
      user_id: ledger.userId,
      name: `Spec category ${String(Math.random()).slice(2, 10)}`,
      type: 'expense',
      color: '#D22129',
    },
  });
}

async function expense(walletId: string, amount: string, options: { deleted?: boolean } = {}) {
  return prisma.transaction.create({
    data: {
      user_id: ledger.userId,
      transaction_type: 'expense',
      occurred_on: new Date('2026-10-05T00:00:00.000Z'),
      wallet_id: walletId,
      category_id: (await category()).id,
      amount,
      currency_id: 'TST',
      base_amount: amount,
      base_currency_id: 'TST',
      deleted_at: options.deleted === true ? new Date() : null,
    },
  });
}

const computed = (walletId: string) => runAsCaller(caller, () => recomputeBalance(walletId));
const shown = (decimal: { toFixed: (places: number) => string }) => decimal.toFixed(4);

describe('a wallet’s balance is the sum of what its rows say (ADR-0025)', () => {
  it('adds income and subtracts expense on an asset, starting from opening_balance', async () => {
    const cash = await wallet({ name: 'Asset', isLiability: false, opening: '1000.0000' });

    await expense(cash.id, '250.5000');
    await prisma.transaction.create({
      data: {
        user_id: ledger.userId,
        transaction_type: 'income',
        occurred_on: new Date('2026-10-06T00:00:00.000Z'),
        wallet_id: cash.id,
        category_id: (await prisma.category.create({
          data: { user_id: ledger.userId, name: `Salary ${cash.id}`, type: 'income', color: '#1F7A4D' },
        })).id,
        amount: '4000.0000',
        currency_id: 'TST',
        base_amount: '4000.0000',
        base_currency_id: 'TST',
      },
    });

    expect(shown(await computed(cash.id))).toBe('4749.5000');
  });

  it('moves a card the other way: an expense raises the stored balance', async () => {
    const card = await wallet({ name: 'Card', isLiability: true });

    await expense(card.id, '50000.0000');

    expect(shown(await computed(card.id))).toBe('50000.0000');
  });

  it('leaves the money the user removed out of it — deleted_at IS NULL is not optional (ADR-0005)', async () => {
    const cash = await wallet({ name: 'Asset with a deleted row', isLiability: false });

    await expense(cash.id, '50000.0000');
    await expense(cash.id, '70000.0000', { deleted: true });

    expect(shown(await computed(cash.id))).toBe('-50000.0000');
  });

  it('counts the arrival leg of a transfer by its destination_amount, not its amount', async () => {
    const source = await wallet({ name: 'Transfer source', isLiability: false });
    const target = await wallet({ name: 'Transfer target', isLiability: false });

    await prisma.transaction.create({
      data: {
        user_id: ledger.userId,
        transaction_type: 'transfer',
        occurred_on: new Date('2026-10-07T00:00:00.000Z'),
        wallet_id: source.id,
        destination_wallet_id: target.id,
        amount: '500000.0000',
        currency_id: 'TST',
        base_amount: '500000.0000',
        base_currency_id: 'TST',
        // Deliberately different from `amount`, so a recompute that reads the wrong column fails here
        // rather than in production. A same-currency transfer stores none (ADR-0004), and this is the
        // cross-currency shape.
        destination_amount: '480000.0000',
      },
    });

    expect(shown(await computed(source.id))).toBe('-500000.0000');
    expect(shown(await computed(target.id))).toBe('480000.0000');
  });
});

describe('the stored balance is the recomputed one (Task 3.4 acceptance)', () => {
  it.each([
    ['an asset', false, '-50000.0000'],
    ['a card', true, '50000.0000'],
  ])('syncBalance writes the same figure it computed, for %s', async (_label, isLiability, expected) => {
    const target = await wallet({ name: `Synced ${String(isLiability)}`, isLiability });
    await expense(target.id, '50000.0000');

    const written = await runAsCaller(caller, () =>
      prisma.$transaction((tx) => syncBalance(target.id, tx as unknown as Transaction)),
    );

    const stored = await prisma.wallet.findUniqueOrThrow({ where: { id: target.id } });

    expect(shown(written)).toBe(expected);
    expect(shown(stored.current_balance)).toBe(expected);
    expect(shown(await computed(target.id))).toBe(expected);
  });
});
