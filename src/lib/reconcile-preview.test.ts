import { describe, expect, it } from 'vitest';

import { reconcilePreview } from './reconcile-preview';

/*
 * The client's copy of ADR-0025, checked against the four rows of the PRD §11 table.
 *
 * These tests exist because `reconcile` derives the direction server-side and the screen derives it
 * too — two copies of one rule, which is the arrangement the invariant suite normally refuses. The
 * excuse is that the screen's copy is a preview of a decision the server re-makes and can overrule,
 * so the only way the two can be kept honest is a spec that pins the preview to the same table the
 * server spec (`test/reconciliation.spec.ts`) pins the module to. If the inversion drifts here, the
 * screen promises one row and the server files the other — and this file is where that shows up.
 */

const ASSET = { isLiability: false, recordedBalance: '0.0000' };
const CARD = { isLiability: true, recordedBalance: '0.0000' };

describe('an asset wallet: the obvious answer is the answer', () => {
  it('a statement higher than the ledger is an income', () => {
    expect(reconcilePreview({ ...ASSET, actualBalance: '50.0000' })).toEqual({
      difference: '50.0000',
      direction: 'income',
      amount: '50.0000',
    });
  });

  it('a statement lower than the ledger is an expense', () => {
    expect(reconcilePreview({ ...ASSET, actualBalance: '-50.0000' })).toEqual({
      difference: '-50.0000',
      direction: 'expense',
      amount: '50.0000',
    });
  });
});

describe('a liability inverts the same pair (ADR-0025)', () => {
  it('debt the ledger does not know about is an expense, and the statement difference reads positive', () => {
    // The card owes 500.000 more than the ledger thinks: net worth fell, so the row is an expense —
    // while the figure the user reads off the statement went UP. Both spellings are on purpose.
    expect(
      reconcilePreview({ ...CARD, actualBalance: '500000.0000' }),
    ).toEqual({ difference: '500000.0000', direction: 'expense', amount: '500000.0000' });
  });

  it('debt that disappeared is an income', () => {
    const card = { ...CARD, recordedBalance: '500000.0000' };
    expect(reconcilePreview({ ...card, actualBalance: '400000.0000' })).toEqual({
      difference: '-100000.0000',
      direction: 'income',
      amount: '100000.0000',
    });
  });

  it('a card in credit (a negative statement figure) is positive net worth, and rising it is an expense', () => {
    // The stored balance goes negative when the bank holds your money; MORE of it is money you have,
    // which is exactly why `value` is never `-Math.abs(balance)`.
    const card = { ...CARD, recordedBalance: '-100.0000' };
    expect(reconcilePreview({ ...card, actualBalance: '-200.0000' })).toEqual({
      difference: '-100.0000',
      direction: 'income',
      amount: '100.0000',
    });
  });
});

describe('the states the screen needs besides a number', () => {
  it('says match rather than filing a zero row', () => {
    expect(reconcilePreview({ ...ASSET, actualBalance: '0.0000' })).toEqual({
      difference: '0.0000',
      direction: 'match',
      amount: '0.0000',
    });
  });

  it('offers nothing for a half-typed or impossible figure', () => {
    expect(reconcilePreview({ ...ASSET, actualBalance: '' })).toBeNull();
    expect(reconcilePreview({ ...ASSET, actualBalance: '-' })).toBeNull();
    expect(reconcilePreview({ ...ASSET, actualBalance: '1.23456' })).toBeNull();
    expect(reconcilePreview({ ...ASSET, actualBalance: '1e5' })).toBeNull();
    expect(reconcilePreview({ ...ASSET, actualBalance: '12.500.000' })).toBeNull();
  });

  it('reads the Indonesian decimal comma the keyboard offers', () => {
    expect(reconcilePreview({ ...ASSET, actualBalance: '50,25' })).toEqual({
      difference: '50.2500',
      direction: 'income',
      amount: '50.2500',
    });
  });

  it('stays exact where a Number cannot hold the scaled figure', () => {
    // The column's 15 integer digits fit under 2^53, but the arithmetic here happens at scale 10^4 —
    // 900000000000000.0001 as an integer is 9e18, and float would read it as .0000 and report a match
    // the ledger does not have.
    const big = { isLiability: false, recordedBalance: '900000000000000.0000' };
    expect(reconcilePreview({ ...big, actualBalance: '900000000000000.0001' })).toEqual({
      difference: '0.0001',
      direction: 'income',
      amount: '0.0001',
    });
  });
});
