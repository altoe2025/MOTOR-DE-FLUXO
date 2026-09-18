import type { ISODate } from './domain';
import { ImportValidationError } from './errors';

const CIVIL_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

function invalidDate(): never {
  throw new ImportValidationError(
    'INVALID_FORMAT',
    'data civil inválida',
  );
}

function dateOutOfRange(): never {
  throw new ImportValidationError(
    'VALUE_OUT_OF_RANGE',
    'data fora do calendário ISO suportado',
  );
}

function toUtcTimestamp(
  year: number,
  month: number,
  day: number,
): number {
  if (year < 1 || year > 9999) {
    return invalidDate();
  }
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const timestamp = date.getTime();
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return invalidDate();
  }
  return timestamp;
}

function formatIsoDate(timestamp: number): ISODate {
  return new Date(timestamp).toISOString().slice(0, 10) as ISODate;
}

function parseIsoTimestamp(value: ISODate): number {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return invalidDate();
  }
  return toUtcTimestamp(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

export function parseCivilDate(value: string | Date): ISODate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return invalidDate();
    }
    return formatIsoDate(
      toUtcTimestamp(
        value.getUTCFullYear(),
        value.getUTCMonth() + 1,
        value.getUTCDate(),
      ),
    );
  }

  const isoMatch = ISO_DATE_PATTERN.exec(value);
  if (isoMatch !== null) {
    return formatIsoDate(
      toUtcTimestamp(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
      ),
    );
  }

  const match = CIVIL_DATE_PATTERN.exec(value);
  if (match === null) {
    return invalidDate();
  }
  return formatIsoDate(
    toUtcTimestamp(
      Number(match[3]),
      Number(match[2]),
      Number(match[1]),
    ),
  );
}

export function daysBetween(start: ISODate, end: ISODate): number {
  return (
    parseIsoTimestamp(end) - parseIsoTimestamp(start)
  ) / MILLISECONDS_PER_DAY;
}

export function addCivilDays(
  start: ISODate,
  days: number,
): ISODate {
  if (!Number.isInteger(days)) {
    throw new ImportValidationError(
      'VALUE_OUT_OF_RANGE',
      'quantidade de dias deve ser inteira',
    );
  }
  const timestamp = (
    parseIsoTimestamp(start) + days * MILLISECONDS_PER_DAY
  );
  const result = new Date(timestamp);
  if (
    result.getUTCFullYear() < 1
    || result.getUTCFullYear() > 9999
  ) {
    return dateOutOfRange();
  }
  return formatIsoDate(timestamp);
}
