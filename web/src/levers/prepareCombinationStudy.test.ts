import { describe, expect, it } from 'vitest';

import type { CompanyRecord } from '../cases/domain';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { appendExecution, appendScenario, createStudy, duplicateStudy, updateScenario } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeScenarioDraft } from '../study/fixtures';
import { validateStudyDocument } from '../study/validation';
import type { DeepMutable, ExecutionRecord, StudyDocument } from '../study/model';
import { combineObservedCases } from './companies';
import { NEUTRAL_LEVERS } from './applyLevers';
import { recommendPortfolios } from './portfolioRecommendation';
import { applyLeversToCombinationBase, isCurrentCombinationScenario, prepareCombinationStudy } from './prepareCombinationStudy';

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

function runningExecution(study: StudyDocument, scenarioId: string): ExecutionRecord {
  const scenario = study.scenarios.find((item) => item.id === scenarioId)!;
  return {
    id: crypto.randomUUID(), scenarioId, scenarioRevision: scenario.revision,
    inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: {
      api_version: '1.0.0', request_id: crypto.randomUUID(), study_id: study.id,
      scenario_id: scenario.id, scenario_revision: scenario.revision,
      cenario: {
        ordens: structuredClone(scenario.sourceSnapshot.orders), horizonte_dias: 30,
        janela_dias: scenario.premises.windowDays, custo: structuredClone(scenario.premises.costs),
      },
      periodo: structuredClone(scenario.period.httpPeriod), proveniencia: {},
    },
    engineVersion: 'a'.repeat(40), contractVersion: '1.0.0', status: 'RUNNING',
    envelope: null, observedComparison: null, createdAt: FIXTURE_NOW, finishedAt: null,
  };
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

  it('replaces an obsolete batch and its executions in one revision after the base fingerprint changes', async () => {
    const study = await prepareCombinationStudy(await fixture(), () => {});
    const base = study.scenarios[0]!;
    const staleScenario = study.scenarios[1]!;
    const withStaleExecution = await appendExecution(study, runningExecution(study, staleScenario.id), FIXTURE_NOW);
    const edited = await updateScenario(withStaleExecution, base.id,
      { premises: { ...base.premises, windowDays: base.premises.windowDays + 1 } }, FIXTURE_NOW);
    const next = await prepareCombinationStudy(edited, () => {});
    expect(next.revision).toBe(edited.revision + 1);
    expect(next.scenarios).toHaveLength(7);
    expect(next.executions).toEqual([]);
    expect(next.scenarios[0]!.id).toBe(base.id);
    expect(next.scenarios.some((scenario) => scenario.id === staleScenario.id)).toBe(false);
    const current = next.scenarios.filter((scenario) => isCurrentCombinationScenario(next, scenario));
    expect(current).toHaveLength(7);
    expect(current.every((scenario) => scenario.premises.windowDays === base.premises.windowDays + 1)).toBe(true);
    const recommendation = recommendPortfolios(next, null);
    expect(recommendation.excluded).toHaveLength(7);
    expect(recommendation.excluded.every((item) => current.some((scenario) => scenario.id === item.scenarioId))).toBe(true);
    expect((await validateStudyDocument(next)).ok).toBe(true);
  });

  it('prunes only obsolete combinations while reusing current scenarios and their executions', async () => {
    const prepared = await prepareCombinationStudy(await fixture(), () => {});
    const currentScenario = prepared.scenarios[1]!;
    const withCurrentExecution = await appendExecution(
      prepared, runningExecution(prepared, currentScenario.id), FIXTURE_NOW,
    );
    const staleDraft = {
      ...structuredClone(prepared.scenarios[2]!), id: crypto.randomUUID(),
      premises: {
        ...structuredClone(prepared.scenarios[2]!.premises),
        windowDays: prepared.scenarios[2]!.premises.windowDays + 1,
      },
    };
    const withStaleScenario = await appendScenario(withCurrentExecution, staleDraft, FIXTURE_NOW);
    const staleScenario = withStaleScenario.scenarios.at(-1)!;
    const mixed = await appendExecution(
      withStaleScenario, runningExecution(withStaleScenario, staleScenario.id), FIXTURE_NOW,
    );

    const next = await prepareCombinationStudy(mixed, () => {});

    expect(next.revision).toBe(mixed.revision + 1);
    expect(next.scenarios).toHaveLength(7);
    expect(next.scenarios.map((scenario) => scenario.id)).toContain(currentScenario.id);
    expect(next.scenarios.map((scenario) => scenario.id)).not.toContain(staleScenario.id);
    expect(next.executions).toHaveLength(1);
    expect(next.executions[0]!.scenarioId).toBe(currentScenario.id);
    expect((await validateStudyDocument(next)).ok).toBe(true);
  });

  it('treats neutral base levers as an exact no-op without revision or fingerprint changes', async () => {
    const study = await fixture();
    const base = study.scenarios[0]!;
    const next = await applyLeversToCombinationBase(
      study, { ...NEUTRAL_LEVERS, group: 'Empresa 0' }, FIXTURE_NOW, () => crypto.randomUUID(),
    );
    expect(next).toBe(study);
    expect(next.revision).toBe(study.revision);
    expect(next.scenarios[0]!.revision).toBe(base.revision);
    expect(next.scenarios[0]!.inputFingerprint).toBe(base.inputFingerprint);
  });
});
