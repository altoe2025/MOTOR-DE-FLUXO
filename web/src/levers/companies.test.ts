import { describe, expect, it } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { makeObservedCase } from '../study/fixtures';
import { combineObservedCases, companyResolver } from './companies';
import { combinationPreset, companySubsets, derivationKind } from './leverScenario';

const company = (id: string, displayName: string) => ({ id, displayName } as CompanyRecord);
const companies = [company('c-astro', 'AstroPay'), company('c-y', 'Empresa Y')];
const astro: ObservedCase = makeObservedCase();
const later: ObservedCase = {
  ...makeObservedCase(), id: 'case-2', companyId: 'c-y',
  window: { startDate: '2026-09-03', endDate: '2026-09-30', closingDate: '2026-09-30' },
  orders: makeObservedCase().orders.map((order) => ({ ...order, knownDate: '2026-09-04', deadlineDate: '2026-09-06' })),
};

describe('combineObservedCases', () => {
  it('põe as empresas no mesmo calendário, marca a empresa e resolve IDs repetidos', () => {
    const first = { ...astro, companyId: 'c-astro' };
    const combined = combineObservedCases([first, later], companies);
    expect(combined.startDate).toBe('2026-09-01');
    const [fromAstro, fromY] = combined.definition.orders;
    expect(fromAstro!.id).toBe('observed-order-1');
    expect(fromY!.id).toBe('observed-order-1@Empresa Y');
    expect([fromY!.dia_conhecida, fromY!.dia_limite]).toEqual([3, 5]);
    expect(combined.definition.companyByOrder?.[fromY!.id]?.companyName).toBe('Empresa Y');
    expect(Object.keys(combined.definition.provenanceByOrder)).toEqual([fromAstro!.id, fromY!.id]);
    const companyOf = companyResolver({ kind: 'AUTHORED', authoredPortfolioId: 'p', definition: combined.definition });
    expect(companyOf(fromAstro!.id)).toBe('AstroPay');
    expect(companyOf('X-IN-01')).toBe('X');
  });

  it('exige dois casos e um caso por empresa', () => {
    expect(() => combineObservedCases([astro], companies)).toThrow('dois casos');
    expect(() => combineObservedCases([astro, { ...later, companyId: astro.companyId }], companies)).toThrow('um caso por empresa');
  });
});

describe('companySubsets', () => {
  it('lista cada empresa sozinha e cada grupo, sem o vazio e sem o completo', () => {
    expect(companySubsets(['AP', 'X', 'Y'])).toEqual([['AP'], ['X'], ['Y'], ['AP', 'X'], ['AP', 'Y'], ['X', 'Y']]);
  });

  it('com 8 empresas gera 254 variações — por isso fica como opção avançada', () => {
    expect(companySubsets(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])).toHaveLength(254);
  });
});

describe('presets de composição', () => {
  const companies = ['A', 'B', 'C', 'D'];

  it('"Cada empresa sozinha" gera uma variação por empresa', () => {
    expect(combinationPreset('ALONE', companies)).toEqual([['A'], ['B'], ['C'], ['D']]);
  });

  it('"Retirar uma por vez" gera uma variação sem cada empresa', () => {
    expect(combinationPreset('LEAVE_ONE_OUT', companies)).toEqual([['B', 'C', 'D'], ['A', 'C', 'D'], ['A', 'B', 'D'], ['A', 'B', 'C']]);
  });

  it('com duas empresas "retirar uma" é igual a "sozinha" e não duplica', () => {
    expect(combinationPreset('LEAVE_ONE_OUT', ['A', 'B'])).toEqual([]);
  });

  it('classifica o vínculo pelo tamanho do subconjunto', () => {
    expect(derivationKind(['A'], companies)).toBe('COMPANY_ALONE');
    expect(derivationKind(['A', 'B', 'C'], companies)).toBe('LEAVE_ONE_OUT');
    expect(derivationKind(['A', 'B'], companies)).toBe('SUBSET');
  });
});
