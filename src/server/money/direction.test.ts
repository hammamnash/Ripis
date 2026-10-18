import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { balanceDelta, value, valueDelta, type MovementRole, type WalletLike } from './direction';

/**
 * The table is the test. Every entry point in the ledger asks one of these two questions, and both
 * answers follow from the same flag, so an entry that gets a credit card backwards shows up here as
 * one wrong number rather than as a plausible-looking report three phases later.
 */
const ASSET: WalletLike = { is_liability: false };
const LIABILITY: WalletLike = { is_liability: true };

const decimal = (text: string) => new Prisma.Decimal(text);
const shown = (value: Prisma.Decimal) => value.toString();

describe('value', () => {
  it('adds an asset and subtracts a liability, both stored positive', () => {
    expect(shown(value(ASSET, decimal('1250000')))).toBe('1250000');
    expect(shown(value(LIABILITY, decimal('2000000')))).toBe('-2000000');
  });

  it('is a sign flip rather than an absolute value, so a card in credit counts as money held', () => {
    expect(shown(value(LIABILITY, decimal('-500000')))).toBe('500000');
    expect(shown(value(ASSET, decimal('-500000')))).toBe('-500000');
  });

  it('keeps the scale of a Decimal(19,4) amount instead of drifting through a float', () => {
    expect(shown(value(LIABILITY, decimal('1234567.8912')))).toBe('-1234567.8912');
  });
});

describe('balanceDelta', () => {
  const table: Array<[string, WalletLike, MovementRole, string, string, string]> = [
    ['Cash (asset)', ASSET, 'expense', '50000', '-50000', '-50000'],
    ['Cash (asset)', ASSET, 'income', '50000', '50000', '50000'],
    ['Cash (asset)', ASSET, 'out', '500000', '-500000', '-500000'],
    ['Cash (asset)', ASSET, 'in', '500000', '500000', '500000'],
    ['Credit card (liability)', LIABILITY, 'expense', '50000', '-50000', '50000'],
    ['Credit card (liability)', LIABILITY, 'income', '50000', '50000', '-50000'],
    ['Credit card (liability)', LIABILITY, 'out', '500000', '-500000', '500000'],
    ['Credit card (liability)', LIABILITY, 'in', '500000', '500000', '-500000'],
  ];

  it.each(table)(
    '%s: %s %s → value %s, stored balance %s',
    (_label, wallet, role, amount, expectedValue, expectedBalance) => {
      expect(shown(valueDelta(role, decimal(amount)))).toBe(expectedValue);
      expect(shown(balanceDelta(wallet, role, decimal(amount)))).toBe(expectedBalance);
    },
  );

  it('spends a credit card into more debt: the balance rises while net worth falls', () => {
    const card = { is_liability: true };
    const debt = decimal('2000000');
    const spent = decimal('50000');

    const afterBalance = debt.plus(balanceDelta(card, 'expense', spent));

    expect(shown(afterBalance)).toBe('2050000');
    expect(shown(value(card, afterBalance))).toBe('-2050000');
  });
});

/**
 * The property behind the table, and the reason the two functions live in one file: applying a
 * movement to the stored balance and then taking the value must give the same answer as applying the
 * movement in value space. If that ever stops holding, one of the two paths has started guessing the
 * sign from somewhere other than `is_liability`.
 */
describe('value and balanceDelta agree', () => {
  const ROLES: MovementRole[] = ['expense', 'income', 'out', 'in'];
  const START = decimal('1000000');
  const MOVEMENT = decimal('1234.5678');

  it.each([['asset', ASSET], ['liability', LIABILITY]] as Array<[string, WalletLike]>)(
    'on a %s wallet, whichever way round the movement is applied',
    (_label, wallet) => {
      for (const role of ROLES) {
        const afterBalance = START.plus(balanceDelta(wallet, role, MOVEMENT));
        const inValueSpace = value(wallet, START).plus(valueDelta(role, MOVEMENT));

        expect(shown(value(wallet, afterBalance))).toBe(shown(inValueSpace));
      }
    },
  );

  it('leaves a wallet that has moved both ways where it started', () => {
    for (const wallet of [ASSET, LIABILITY]) {
      const moved = START
        .plus(balanceDelta(wallet, 'income', MOVEMENT))
        .plus(balanceDelta(wallet, 'expense', MOVEMENT));

      expect(shown(moved)).toBe(shown(START));
    }
  });
});
