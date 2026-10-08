import Decimal from 'decimal.js';

import { ImportValidationError } from './errors';

const DECIMAL = /^-?\d+(?:[.,]\d{1,6})?$/;
const MAXIMUM = new Decimal('1000000000000');

export function parseBrlDecimal(raw: string): string {
  if (!DECIMAL.test(raw)) throw new ImportValidationError('INVALID_FORMAT', 'Valor em reais inválido. Use só números, com vírgula ou ponto e até 6 casas, sem R$ nem separador de milhar. Ex.: 150000,00.');
  const value = new Decimal(raw.replace(',', '.'));
  if (value.lte(0) || value.gt(MAXIMUM)) throw new ImportValidationError('VALUE_OUT_OF_RANGE', 'O valor em reais deve ser maior que zero e até 1 trilhão. Ex.: 150000,00.');
  return value.toFixed();
}
