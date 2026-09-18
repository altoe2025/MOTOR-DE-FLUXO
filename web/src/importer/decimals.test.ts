import { describe, expect, it } from 'vitest';

import { parseBrlDecimal } from './decimals';

describe('parseBrlDecimal', () => {
  it.each([
    ['1500000,00', '1500000'],
    ['1500000.00', '1500000'],
    ['12,345600', '12.3456'],
    ['0,000001', '0.000001'],
    ['999999999999,999999', '999999999999.999999'],
    ['1000000000000', '1000000000000'],
  ])('converte %s para o decimal canônico %s', (raw, expected) => {
    expect(parseBrlDecimal(raw)).toBe(expected);
  });

  it.each([
    '1.500.000,00',
    '1,500,000.00',
    '1e3',
    '1E3',
    'NaN',
    'Infinity',
    '+10',
    ' 10',
    '10 ',
    '10,1234567',
    '10.1234567',
    '',
  ])('rejeita o formato decimal %s', (raw) => {
    expect(() => parseBrlDecimal(raw)).toThrow('INVALID_FORMAT');
  });

  it.each([
    '0',
    '0,000000',
    '-1',
    '1000000000000,000001',
  ])('rejeita o valor fora do intervalo %s', (raw) => {
    expect(() => parseBrlDecimal(raw)).toThrow(
      'VALUE_OUT_OF_RANGE',
    );
  });

  it('não perde precisão em valores grandes', () => {
    expect(parseBrlDecimal('999999999999,123456')).toBe(
      '999999999999.123456',
    );
  });
});
