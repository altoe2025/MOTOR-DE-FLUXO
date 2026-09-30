import { describe, expect, it } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { NEUTRAL_LEVERS } from '../levers/applyLevers';
import { createStudy, renameScenario } from './domain';
import { makeScenarioDraft } from './fixtures';
import { combinationName, formatPeriod, suggestStudyName, uniqueName, variationName } from './naming';

const company = (id: string, displayName: string) => ({ id, displayName }) as CompanyRecord;
const observed = (companyId: string, startDate: string, endDate: string) =>
  ({ companyId, window: { startDate, endDate } }) as ObservedCase;

describe('nomes de estudo e cenários', () => {
  it('formata o período por mês', () => {
    expect(formatPeriod('2026-01-01', '2026-01-31')).toBe('jan/2026');
    expect(formatPeriod('2026-01-01', '2026-03-31')).toBe('jan–mar/2026');
    expect(formatPeriod('2025-12-01', '2026-01-31')).toBe('dez/2025–jan/2026');
    expect(formatPeriod('2025-12-31', '2026-01-30')).toBe('jan/2026');
    expect(formatPeriod('2026-01-15', '2026-02-14')).toBe('jan–fev/2026');
  });

  it('sugere o nome do estudo pelas empresas juntadas e o período', () => {
    const companies = [company('a', 'AstroPay'), company('x', 'Empresa X'), company('y', 'Empresa Y')];
    expect(suggestStudyName([observed('a', '2026-01-01', '2026-01-31'), observed('x', '2026-01-02', '2026-01-30'),
      observed('y', '2026-01-01', '2026-01-31')], companies)).toBe('AstroPay + Empresa X + Empresa Y · jan/2026');
    expect(suggestStudyName([], companies)).toBeNull();
  });

  it('gera nomes curtos de combinação e de variação', () => {
    expect(combinationName(['AstroPay', 'X'])).toBe('Só AstroPay + X');
    const levers = { ...NEUTRAL_LEVERS, group: 'Y', volumeOut: '2', shiftDays: 3 };
    expect(variationName(levers, 'Cenário base', true)).toBe('Y: OUT ×2, +3 d');
    expect(variationName({ ...NEUTRAL_LEVERS, group: 'X', removeCompany: true }, 'Cenário base', true)).toBe('Sem X');
    expect(variationName(levers, 'Só Y', false)).toBe('Só Y → Y: OUT ×2, +3 d');
    expect(combinationName(Array.from({ length: 30 }, (_, index) => `Empresa ${index}`)).length).toBeLessThanOrEqual(120);
  });

  it('evita nomes repetidos', () => {
    expect(uniqueName('Só X', ['Só X', 'Só X (2)'])).toBe('Só X (3)');
    expect(uniqueName('Só Y', ['Só X'])).toBe('Só Y');
  });

  it('renomeia o cenário sem mudar revisão nem identidade da entrada', async () => {
    const study = await createStudy({ id: 'study-rename', ownerSub: 'user-a', name: 'Estudo',
      baseScenario: makeScenarioDraft(), now: '2026-01-01T00:00:00Z' });
    const before = study.scenarios[0]!;
    const renamed = await renameScenario(study, before.id, 'Original jan', '2026-01-02T00:00:00Z');
    const after = renamed.scenarios[0]!;
    expect(after.name).toBe('Original jan');
    expect(after.revision).toBe(before.revision);
    expect(after.inputFingerprint).toBe(before.inputFingerprint);
    expect(renamed.revision).toBe(study.revision + 1);
    await expect(renameScenario(study, before.id, ' ', '2026-01-02T00:00:00Z')).rejects.toThrow();
  });
});
