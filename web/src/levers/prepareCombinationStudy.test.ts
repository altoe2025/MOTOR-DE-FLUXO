import { describe, expect, it } from 'vitest';

import type { CompanyRecord } from '../cases/domain';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { createStudy, duplicateStudy, updateScenario } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeScenarioDraft } from '../study/fixtures';
import { validateStudyDocument } from '../study/validation';
import type { DeepMutable } from '../study/model';
import { combineObservedCases } from './companies';
import { isCurrentCombinationScenario, prepareCombinationStudy } from './prepareCombinationStudy';

async function fixture() {
  const cases = [0, 1, 2].map((i) => ({ ...makeObservedCase(), id: `case-${i}`, companyId: `company-${i}` }));
  const companies = cases.map((item, i) => ({ id: item.companyId, displayName: `Empresa ${i}` } as CompanyRecord));
  const { definition } = combineObservedCases(cases, companies);
  const sourceSnapshot = await resolvePortfolioSource({ kind: 'AUTHORED', authoredPortfolioId: crypto.randomUUID(), definition }, {
    getObservedCase: async () => null, preparePortfolio: async () => { throw new Error('not used'); }, now: () => FIXTURE_NOW,
  });
  return createStudy({ id: crypto.randomUUID(), ownerSub: FIXTURE_OWNER, name: 'Combinações',
    studyType: 'PORTFOLIO_COMBINATIONS', baseScenario: makeScenarioDraft({
      sourceSnapshot: structuredClone(sourceSnapshot) as DeepMutable<typeof sourceSnapshot>,
    }), now: FIXTURE_NOW });
}

describe('combination study preparation', () => {
  it('persists the distinct type and creates six internal combinations in one revision', async () => {
    const study = await fixture();
    const next = await prepareCombinationStudy(study, () => {});
    expect(next.studyType).toBe('PORTFOLIO_COMBINATIONS');
    expect(next.scenarios).toHaveLength(7);
    expect(next.revision).toBe(study.revision + 1);
    expect((await validateStudyDocument(next)).ok).toBe(true);
    const copy = await duplicateStudy(next, FIXTURE_NOW, () => crypto.randomUUID());
    expect(copy.studyType).toBe('PORTFOLIO_COMBINATIONS');
  });

  it('reuses the existing scenarios and results on an unchanged retry', async () => {
    const study = await prepareCombinationStudy(await fixture(), () => {});
    expect(await prepareCombinationStudy(study, () => {})).toBe(study);
  });

  it('preserves earlier scenarios but only diagnoses combinations of the current premises', async () => {
    const study = await prepareCombinationStudy(await fixture(), () => {});
    const base = study.scenarios[0]!;
    const edited = await updateScenario(study, base.id,
      { premises: { ...base.premises, windowDays: base.premises.windowDays + 1 } }, FIXTURE_NOW);
    const next = await prepareCombinationStudy(edited, () => {});
    expect(next.scenarios).toHaveLength(13);
    const current = next.scenarios.filter((scenario) => isCurrentCombinationScenario(next, scenario));
    expect(current).toHaveLength(7);
    expect(current.every((scenario) => scenario.premises.windowDays === base.premises.windowDays + 1)).toBe(true);
    expect(next.scenarios.some((scenario) => scenario.id === study.scenarios[1]!.id)).toBe(true);
    expect(next.scenarios[0]!.id).toBe(base.id);
  });
});
