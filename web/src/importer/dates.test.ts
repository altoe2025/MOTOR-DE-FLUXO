import { describe, expect, it } from 'vitest';

import { addCivilDays, daysBetween, parseCivilDate } from './dates';

describe('civil dates', () => {
  it.each([
    ['29/02/2028', '2028-02-29'],
    ['2026-10-17', '2026-10-17'],
  ])('normalizes %s without a timezone', (raw, expected) => {
    expect(parseCivilDate(raw)).toBe(expected);
  });

  it.each(['29/02/2027', '31/04/2026', '17/10/26', '17/10/2026T00:00:00'])
    ('rejects invalid civil date %s', (raw) => {
      expect(() => parseCivilDate(raw)).toThrow('INVALID_FORMAT');
    });

  it('calculates and shifts dates as calendar days', () => {
    expect(daysBetween('2026-10-17', '2026-10-19')).toBe(2);
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
