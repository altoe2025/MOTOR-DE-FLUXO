import { describe, expect, it } from 'vitest';

import { parseBrlDecimal } from './decimals';

describe('parseBrlDecimal', () => {
  it.each([
    ['1500000,00', '1500000'],
    ['12,345600', '12.3456'],
    ['999999999999,123456', '999999999999.123456'],
  ])('normalizes %s without floating-point conversion', (raw, expected) => {
    expect(parseBrlDecimal(raw)).toBe(expected);
  });

  it.each(['1.500.000,00', '1e3', ' 10', '10,1234567'])
    ('rejects noncanonical decimal %s', (raw) => {
      expect(() => parseBrlDecimal(raw)).toThrow('INVALID_FORMAT');
    });

  it.each(['0', '-1', '1000000000000,000001'])
    ('rejects amount outside the positive permitted range: %s', (raw) => {
      expect(() => parseBrlDecimal(raw)).toThrow('VALUE_OUT_OF_RANGE');
    });
});
