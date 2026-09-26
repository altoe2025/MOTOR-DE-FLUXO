import Decimal from 'decimal.js';

export type DecimalText = string;

const unavailable = 'Não disponível';

function fixed(value: DecimalText, digits: number): string {
  const rounded = new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP);
  return (rounded.isZero() ? rounded.abs() : rounded).toFixed(digits);
}

function localized(value: string): string {
  const [integer = '0', fraction] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

export function formatMoney(value: DecimalText | null): string {
  return value === null ? unavailable : `R$\u00a0${localized(fixed(value, 2))}`;
}

export function formatSignedMoney(value: DecimalText | null): string {
  if (value === null) return unavailable;
  const decimal = new Decimal(value);
  const sign = decimal.isPositive() && !decimal.isZero() ? '+' : '';
  return `${sign}${formatMoney(value)}`;
}

export function formatFraction(value: DecimalText | null): string {
  return value === null ? unavailable : `${localized(fixed(new Decimal(value).times(100).toFixed(), 2))}%`;
}

export function formatBps(value: DecimalText | null): string {
  return value === null ? unavailable : `${localized(fixed(value, 2))} bps`;
}

export function formatDecimal(value: DecimalText, digits: number): string {
  return localized(fixed(value, digits));
}

export function formatDays(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('dias deve ser inteiro seguro');
  return `${value} ${value === 1 ? 'dia' : 'dias'}`;
}
