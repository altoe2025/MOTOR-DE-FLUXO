import Decimal from 'decimal.js';

import { ImportValidationError } from './errors';

const BRL_DECIMAL_PATTERN = /^-?\d+(?:[.,]\d{1,6})?$/;
const MAXIMUM_BRL_VALUE = new Decimal('1000000000000');

export function parseBrlDecimal(raw: string): string {
  if (!BRL_DECIMAL_PATTERN.test(raw)) {
    throw new ImportValidationError(
      'INVALID_FORMAT',
      'valor BRL inválido',
    );
  }

  const value = new Decimal(raw.replace(',', '.'));
  if (value.lte(0) || value.gt(MAXIMUM_BRL_VALUE)) {
    throw new ImportValidationError(
      'VALUE_OUT_OF_RANGE',
      'valor BRL fora do intervalo permitido',
    );
  }
  return value.toFixed();
}
