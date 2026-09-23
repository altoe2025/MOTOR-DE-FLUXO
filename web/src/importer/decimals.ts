import Decimal from 'decimal.js';

import { ImportValidationError } from './errors';

const DECIMAL = /^-?\d+(?:[.,]\d{1,6})?$/;
const MAXIMUM = new Decimal('1000000000000');

export function parseBrlDecimal(raw: string): string {
  if (!DECIMAL.test(raw)) throw new ImportValidationError('INVALID_FORMAT', 'valor BRL inválido');
  const value = new Decimal(raw.replace(',', '.'));
  if (value.lte(0) || value.gt(MAXIMUM)) throw new ImportValidationError('VALUE_OUT_OF_RANGE', 'valor BRL fora do intervalo permitido');
  return value.toFixed();
}
