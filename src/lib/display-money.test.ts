import { describe, expect, it } from 'vitest';

import { amountParts, MINUS, percentText, trimMoney } from './display-money';

const IDR = { symbol: 'Rp', suffix: false, minorUnit: 0 };
const USD = { symbol: '$', suffix: false, minorUnit: 2 };
const VND = { symbol: '₫', suffix: true, minorUnit: 0 };

describe('amountParts', () => {
  it('groups thousands with periods and shows no decimals on a zero-minor-unit currency', () => {
    expect(amountParts('1250000', IDR)).toEqual({ sign: '', mark: 'Rp', digits: '1.250.000', suffix: false });
  });

  it('drops the four decimal places the wire carries without rounding up', () => {
    expect(amountParts('1250000.4000', IDR).digits).toBe('1.250.000');
  });

  it('rounds the deciding digit half away from zero', () => {
    expect(amountParts('1250000.5000', IDR).digits).toBe('1.250.001');
  });

  it('carries a round across a group boundary', () => {
    expect(amountParts('999.9999', IDR).digits).toBe('1.000');
  });

  it('keeps the currency’s own decimals, with a comma before them', () => {
    expect(amountParts('1250.5', USD).digits).toBe('1.250,50');
  });

  it('rounds on the third decimal for a two-decimal currency', () => {
    expect(amountParts('0.005', USD).digits).toBe('0,01');
  });

  it('leaves a suffix currency’s mark to the caller to place', () => {
    expect(amountParts('5000000', VND)).toEqual({ sign: '', mark: '₫', digits: '5.000.000', suffix: true });
  });

  it('composes the sign from the direction, and never from the magnitude', () => {
    expect(amountParts('1250000', IDR, 'income').sign).toBe('+');
    expect(amountParts('1250000', IDR, 'expense').sign).toBe(MINUS);
    expect(amountParts('1250000', IDR, 'transfer').sign).toBe('\u2192');
  });

  it('keeps a stored negative when no direction is given', () => {
    const parts = amountParts('-1250000', IDR);

    expect(parts.sign).toBe(MINUS);
    expect(parts.digits).toBe('1.250.000');
  });

  it('does not double the minus when a stored negative is also labelled an expense', () => {
    expect(amountParts('-1250000', IDR, 'expense').sign).toBe(MINUS);
  });

  it('renders zero as a single digit', () => {
    expect(amountParts('0.0000', IDR).digits).toBe('0');
  });

  it('stays exact past the range where a double would round', () => {
    expect(amountParts('1000000000001', IDR).digits).toBe('1.000.000.000.001');
  });

  it('refuses anything that is not a decimal amount', () => {
    expect(() => amountParts('abc', IDR)).toThrow(/Not a decimal amount/);
    expect(() => amountParts('1e5', IDR)).toThrow(/Not a decimal amount/);
    expect(() => amountParts('', IDR)).toThrow(/Not a decimal amount/);
  });
});

describe('percentText', () => {
  it('drops trailing zeros and keeps a comma for the rest', () => {
    expect(percentText('45.00')).toBe('45%');
    expect(percentText('104.50')).toBe('104,5%');
    expect(percentText('99.99')).toBe('99,99%');
  });

  it('does not lose the fact that the budget was reached exactly', () => {
    expect(percentText('100.00')).toBe('100%');
    expect(percentText('0.00')).toBe('0%');
  });

  it('refuses anything that is not a decimal percentage', () => {
    expect(() => percentText('x')).toThrow(/Not a decimal percentage/);
  });
});

describe('trimMoney', () => {
  it('drops the four decimal places the wire carries', () => {
    expect(trimMoney('2000000.0000')).toBe('2000000');
    expect(trimMoney('1250.5000')).toBe('1250.5');
    expect(trimMoney('0.0001')).toBe('0.0001');
  });

  it('leaves a value that is already plain alone, and passes null through', () => {
    expect(trimMoney('2000000')).toBe('2000000');
    expect(trimMoney(null)).toBeNull();
  });
});
