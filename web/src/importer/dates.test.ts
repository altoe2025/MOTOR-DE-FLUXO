import { describe, expect, it } from 'vitest';

import {
  addCivilDays,
  daysBetween,
  parseCivilDate,
} from './dates';
import type { ISODate } from './domain';

describe('parseCivilDate', () => {
  it('aceita 29 de fevereiro em ano bissexto', () => {
    expect(parseCivilDate('29/02/2028')).toBe('2028-02-29');
  });

  it('rejeita 29 de fevereiro em ano não bissexto', () => {
    expect(() => parseCivilDate('29/02/2027')).toThrow(
      'INVALID_FORMAT',
    );
  });

  it.each([
    '31/04/2026',
    '00/01/2026',
    '01/13/2026',
    '2026-10-17',
    '17/10/26',
    '17/10/2026T00:00:00',
  ])('rejeita a data civil inválida %s', (value) => {
    expect(() => parseCivilDate(value)).toThrow('INVALID_FORMAT');
  });

  it('aceita texto civil sem timezone', () => {
    expect(parseCivilDate('17/10/2026')).toBe('2026-10-17');
  });

  it('lê os componentes UTC de uma célula Excel convertida em Date', () => {
    const excelDate = new Date(Date.UTC(2026, 9, 17, 23, 30));

    expect(parseCivilDate(excelDate)).toBe('2026-10-17');
  });

  it('rejeita Date inválida', () => {
    expect(() => parseCivilDate(new Date(Number.NaN))).toThrow(
      'INVALID_FORMAT',
    );
  });
});

describe('daysBetween', () => {
  it('calcula a diferença entre datas sem considerar horário', () => {
    expect(
      daysBetween(
        '2026-10-17' as ISODate,
        '2026-10-19' as ISODate,
      ),
    ).toBe(2);
  });

  it('não é afetado por uma mudança de horário de verão', () => {
    expect(
      daysBetween(
        '2026-03-07' as ISODate,
        '2026-03-09' as ISODate,
      ),
    ).toBe(2);
  });

  it('preserva o sinal quando a data final vem antes da inicial', () => {
    expect(
      daysBetween(
        '2027-01-01' as ISODate,
        '2026-12-31' as ISODate,
      ),
    ).toBe(-1);
  });
});

describe('addCivilDays', () => {
  it('atravessa uma mudança de mês', () => {
    expect(
      addCivilDays('2026-01-31' as ISODate, 1),
    ).toBe('2026-02-01');
  });

  it('atravessa uma mudança de ano', () => {
    expect(
      addCivilDays('2026-12-31' as ISODate, 1),
    ).toBe('2027-01-01');
  });

  it('aceita deslocamento negativo', () => {
    expect(
      addCivilDays('2027-01-01' as ISODate, -1),
    ).toBe('2026-12-31');
  });
});
