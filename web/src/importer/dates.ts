import type { ISODate } from './domain';
import { ImportValidationError } from './errors';

const CIVIL_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY = 86_400_000;

function invalid(): never { throw new ImportValidationError('INVALID_FORMAT', 'data civil inválida'); }

function utcTimestamp(year: number, month: number, day: number): number {
  if (year < 1 || year > 9999) return invalid();
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return invalid();
  return date.getTime();
}

function format(timestamp: number): ISODate { return new Date(timestamp).toISOString().slice(0, 10) as ISODate; }

function isoTimestamp(value: ISODate): number {
  const match = ISO_DATE.exec(value);
  if (match === null) return invalid();
  return utcTimestamp(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function parseCivilDate(value: string | Date): ISODate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return invalid();
    return format(utcTimestamp(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()));
  }
  const iso = ISO_DATE.exec(value);
  if (iso !== null) return format(utcTimestamp(Number(iso[1]), Number(iso[2]), Number(iso[3])));
  const civil = CIVIL_DATE.exec(value);
  if (civil === null) return invalid();
  return format(utcTimestamp(Number(civil[3]), Number(civil[2]), Number(civil[1])));
}

export function daysBetween(start: ISODate, end: ISODate): number { return (isoTimestamp(end) - isoTimestamp(start)) / DAY; }

export function addCivilDays(start: ISODate, days: number): ISODate {
  if (!Number.isInteger(days)) throw new ImportValidationError('VALUE_OUT_OF_RANGE', 'quantidade de dias deve ser inteira');
  const timestamp = isoTimestamp(start) + days * DAY;
  const result = new Date(timestamp);
  if (result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999) throw new ImportValidationError('VALUE_OUT_OF_RANGE', 'data fora do calendário ISO suportado');
  return format(timestamp);
}
