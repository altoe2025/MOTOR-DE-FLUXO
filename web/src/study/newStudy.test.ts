import { describe, expect, it } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { createStudy } from './domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeScenarioDraft } from './fixtures';
import { addCaseToPortfolio, portfolioCandidates, studyFromObservedCases } from './newStudy';

const company = (id: string, displayName: string) => ({ id, displayName } as CompanyRecord);
const companies = [company('c-astro', 'AstroPay'), company('c-y', 'Empresa Y'), company('c-z', 'Empresa Z')];
const astro: ObservedCase = { ...makeObservedCase(), companyId: 'c-astro' };
const other = (id: string, companyId: string, start: string): ObservedCase => ({
  ...makeObservedCase(), id, companyId,
  window: { startDate: start, endDate: '2026-09-30', closingDate: '2026-09-30' },
  orders: makeObservedCase().orders.map((order) => ({ ...order, knownDate: '2026-09-04', deadlineDate: '2026-09-20' })),
});
const empresaY = other('case-y', 'c-y', '2026-09-03');
const empresaZ = other('case-z', 'c-z', '2026-09-02');

let counter = 0;
const ids = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const base = { ownerSub: FIXTURE_OWNER, now: FIXTURE_NOW, ids, companies };

describe('criar estudo a partir de dados importados', () => {
  it('um caso vira estudo com o caso observado como origem, sem chamar a API', async () => {
    const study = await studyFromObservedCases([astro], base);
    const scenario = study.scenarios[0]!;
    expect(scenario.sourceSnapshot.source).toEqual({ kind: 'OBSERVED_CASE', caseId: astro.id, caseRevision: astro.revision });
    expect(study.name).toBe('AstroPay · set/2026');
    expect(study.revision).toBe(1);
  });

  it('o período cobre até o prazo mais distante', async () => {
    const study = await studyFromObservedCases([empresaY], base);
    const period = study.scenarios[0]!.period.httpPeriod;
    if (period.modo !== 'NATURAL') throw new Error('modo');
    expect(period.dias_aquecimento + period.periodo_medicao_dias).toBeGreaterThanOrEqual(18);
  });

  it('dois casos de empresas diferentes viram uma carteira de empresas', async () => {
    const study = await studyFromObservedCases([astro, empresaY], base);
    const source = study.scenarios[0]!.sourceSnapshot.source;
    if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') throw new Error('origem');
    expect(source.definition.sourceCases?.map((item) => item.companyId)).toEqual(['c-astro', 'c-y']);
    expect(study.name).toBe('AstroPay + Empresa Y · set/2026');
  });
});

describe('adicionar caso a uma carteira', () => {
  it('lista estudos com carteira de empresas e estudos de um caso de outra empresa', async () => {
    const portfolio = await studyFromObservedCases([astro, empresaY], base);
    const single = await studyFromObservedCases([empresaY], base);
    const sameCompany = await studyFromObservedCases([{ ...astro, id: 'case-astro-2' }], base);
    const synthetic = await createStudy({ id: 'synthetic', ownerSub: FIXTURE_OWNER, name: 'Sintético', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
    const deleted = { ...(await studyFromObservedCases([empresaZ], base)), deletedAt: FIXTURE_NOW };
    const candidates = portfolioCandidates([portfolio, single, sameCompany, synthetic, deleted], empresaZ);
    expect(candidates.map((item) => item.study.id)).toEqual([portfolio.id, single.id, sameCompany.id]);
    expect(candidates.map((item) => item.blocked)).toEqual([null, null, null]);
    expect(portfolioCandidates([portfolio], astro)[0]!.blocked).toBe('já contém este caso');
    expect(portfolioCandidates([portfolio], { ...astro, id: 'case-astro-2' }, companies)[0]!.blocked).toBe('já tem um caso de AstroPay');
    expect(portfolioCandidates([sameCompany], { ...astro, id: 'case-astro-3' }, companies, [{ ...astro, id: 'case-astro-2' }])[0]!.blocked).toBe('já tem um caso de AstroPay');
  });

  it('junta o caso ao cenário original e renomeia o estudo com nome sugerido', async () => {
    const portfolio = await studyFromObservedCases([astro, empresaY], base);
    const next = await addCaseToPortfolio(portfolio, empresaZ, { cases: [astro, empresaY, empresaZ], companies, now: FIXTURE_NOW });
    const source = next.scenarios[0]!.sourceSnapshot.source;
    if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') throw new Error('origem');
    expect(source.definition.sourceCases?.map((item) => item.caseId)).toEqual([astro.id, empresaY.id, empresaZ.id]);
    expect(next.name).toBe('AstroPay + Empresa Y + Empresa Z · set/2026');
    expect(next.id).toBe(portfolio.id);
  });

  it('estudo de um caso vira carteira com os dois', async () => {
    const single = await studyFromObservedCases([empresaY], base);
    const renamed = { ...single, name: 'Meu estudo' };
    const next = await addCaseToPortfolio(renamed, astro, { cases: [astro, empresaY], companies, now: FIXTURE_NOW });
    const source = next.scenarios[0]!.sourceSnapshot.source;
    if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') throw new Error('origem');
    expect(source.definition.sourceCases?.map((item) => item.companyId)).toEqual(['c-y', 'c-astro']);
    expect(next.name).toBe('Meu estudo');
  });

  it('recusa quando um caso da carteira não existe mais neste navegador', async () => {
    const portfolio = await studyFromObservedCases([astro, empresaY], base);
    await expect(addCaseToPortfolio(portfolio, empresaZ, { cases: [astro, empresaZ], companies, now: FIXTURE_NOW }))
      .rejects.toThrow('não está mais neste navegador');
  });
});
