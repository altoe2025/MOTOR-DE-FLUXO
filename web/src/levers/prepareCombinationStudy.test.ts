import { describe, expect, it, vi } from 'vitest';

import type { CompanyRecord } from '../cases/domain';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { appendExecution, appendScenario, createStudy, duplicateStudy, removeScenario, replaceScenarioBatch, updateScenario } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeScenarioDraft } from '../study/fixtures';
import { validateStudyDocument } from '../study/validation';
import type { DeepMutable, ExecutionRecord, ScenarioInputProvenance, StudyDocument } from '../study/model';
import { combinationName } from '../study/naming';
import { combineObservedCases } from './companies';
import { companyResolver } from './companies';
import { NEUTRAL_LEVERS } from './applyLevers';
import * as leverScenario from './leverScenario';
import { recommendPortfolios } from './portfolioRecommendation';
import { applyLeversToCombinationBase, isCurrentCombinationScenario, prepareCombinationStudy } from './prepareCombinationStudy';

async function fixture(duplicateNames = false, companyCount = 3) {
  const cases = Array.from({ length: companyCount }, (_, i) => ({
    ...makeObservedCase(), id: `case-${i}`, companyId: `company-${i}`,
  }));
  const companies = cases.map((item, i) => ({
    id: item.companyId, displayName: duplicateNames && i < 2 ? 'Empresa repetida' : `Empresa ${i}`,
  } as CompanyRecord));
  const { definition } = combineObservedCases(cases, companies);
  const sourceSnapshot = await resolvePortfolioSource({ kind: 'AUTHORED', authoredPortfolioId: crypto.randomUUID(), definition }, {
    getObservedCase: async () => null, preparePortfolio: async () => { throw new Error('not used'); }, now: () => FIXTURE_NOW,
  });
  return createStudy({ id: crypto.randomUUID(), ownerSub: FIXTURE_OWNER, name: 'Combinações',
    studyType: 'PORTFOLIO_COMBINATIONS', baseScenario: makeScenarioDraft({
      sourceSnapshot: structuredClone(sourceSnapshot) as DeepMutable<typeof sourceSnapshot>,
    }), now: FIXTURE_NOW });
}

/** The pre-signature preparation used display names and buildLeverScenario for each subset. */
async function legacyPreparedStudy(study: StudyDocument): Promise<StudyDocument> {
  const base = study.scenarios[0]!;
  const companyOf = companyResolver(base.sourceSnapshot.source);
  const groups = [...new Set(base.sourceSnapshot.orders.map((order) => companyOf(order.id)))].sort();
  const drafts = [];
  for (const subset of leverScenario.companySubsets(groups)) {
    drafts.push(await leverScenario.buildLeverScenario({
      base, id: crypto.randomUUID(), authoredPortfolioId: crypto.randomUUID(), recordedAt: FIXTURE_NOW,
      name: combinationName(subset),
      levers: groups.filter((company) => !subset.includes(company))
        .map((group) => ({ ...NEUTRAL_LEVERS, group, removeCompany: true })),
    }));
  }
  return replaceScenarioBatch(study, new Set([base.id]), drafts, FIXTURE_NOW);
}

const inputProvenance: ScenarioInputProvenance = (() => {
  const field = { kind: 'USER_ESTIMATE' as const, source: 'Teste', version: '1', recordedAt: FIXTURE_NOW };
  return { premises: { windowDays: field, costs: {
    iof_out: field, iof_in: field, carry_cnr: field, custo_fixo_remessa: field,
    custo_oportunidade_aa: field, spread_rail_bps: field, ptax: field,
  } }, period: { horizonDays: field } };
})();

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
    expect(study.preparedCombinationCoverage).toEqual({
      baseScenarioId: study.baseScenarioId,
      baseInputFingerprint: study.scenarios[0]!.inputFingerprint,
      baseInputProvenanceCanonical: 'null',
      companyIdsCanonical: '["company-0","company-1","company-2"]',
    });
    const build = vi.spyOn(leverScenario, 'buildLeverScenario');
    try {
      expect(await prepareCombinationStudy(study, () => {})).toBe(study);
      expect(build).not.toHaveBeenCalled();
    } finally {
      build.mockRestore();
    }
  });

  it('adopts complete legacy coverage without changing 63 scenario IDs or a derived execution', async () => {
    const legacy = await legacyPreparedStudy(await fixture(false, 6));
    const derived = legacy.scenarios[1]!;
    const withExecution = await appendExecution(legacy, runningExecution(legacy, derived.id), FIXTURE_NOW);
    expect(withExecution.preparedCombinationCoverage).toBeUndefined();
    expect(withExecution.scenarios).toHaveLength(63);
    const build = vi.spyOn(leverScenario, 'buildLeverScenario');
    try {
      const adopted = await prepareCombinationStudy(withExecution, () => {});
      expect(adopted.scenarios.map((scenario) => scenario.id)).toEqual(withExecution.scenarios.map((scenario) => scenario.id));
      expect(adopted.executions).toEqual(withExecution.executions);
      expect(adopted.scenarios.find((scenario) => scenario.id === derived.id)?.inputFingerprint).toBe(derived.inputFingerprint);
      expect(adopted.preparedCombinationCoverage).toBeDefined();
      expect(build).not.toHaveBeenCalled();
      expect(await prepareCombinationStudy(adopted, () => {})).toBe(adopted);
    } finally {
      build.mockRestore();
    }
  });

  it('rebuilds an incomplete unsigned legacy matrix instead of adopting it', async () => {
    const legacy = await legacyPreparedStudy(await fixture());
    const incomplete = await removeScenario(legacy, legacy.scenarios[1]!.id, FIXTURE_NOW);
    const next = await prepareCombinationStudy(incomplete, () => {});
    expect(next.scenarios).toHaveLength(7);
    expect(next.scenarios.some((scenario) => scenario.id === legacy.scenarios[2]!.id)).toBe(false);
    expect(next.preparedCombinationCoverage).toBeDefined();
  });

  it('rebuilds duplicate unsigned legacy coverage instead of certifying an ambiguous matrix', async () => {
    const legacy = await legacyPreparedStudy(await fixture());
    const duplicate = await appendScenario(legacy, {
      ...structuredClone(legacy.scenarios[1]!), id: crypto.randomUUID(),
    }, FIXTURE_NOW);
    const next = await prepareCombinationStudy(duplicate, () => {});
    expect(next.scenarios).toHaveLength(7);
    expect(next.scenarios.some((scenario) => scenario.id === legacy.scenarios[1]!.id)).toBe(false);
    expect(next.preparedCombinationCoverage).toBeDefined();
  });

  it('rebuilds a legacy matrix collapsed by duplicate display names', async () => {
    const legacy = await legacyPreparedStudy(await fixture(true));
    expect(legacy.scenarios).toHaveLength(3);
    const next = await prepareCombinationStudy(legacy, () => {});
    expect(next.scenarios).toHaveLength(7);
    expect(next.scenarios.some((scenario) => scenario.id === legacy.scenarios[1]!.id)).toBe(false);
    expect(next.preparedCombinationCoverage?.companyIdsCanonical).toBe('["company-0","company-1","company-2"]');
  });

  it('rebuilds a missing combination even when the stored coverage matches the base', async () => {
    const prepared = await prepareCombinationStudy(await fixture(), () => {});
    const missing = await removeScenario(prepared, prepared.scenarios[1]!.id, FIXTURE_NOW);
    const rebuilt = await prepareCombinationStudy(missing, () => {});
    expect(rebuilt.scenarios).toHaveLength(7);
    expect(rebuilt.preparedCombinationCoverage).toEqual(prepared.preparedCombinationCoverage);
    expect(rebuilt.revision).toBe(missing.revision + 1);
  });

  it('reprepares when a company is removed and then added back', async () => {
    const prepared = await prepareCombinationStudy(await fixture(), () => {});
    const base = prepared.scenarios[0]!;
    const reduced = await applyLeversToCombinationBase(
      prepared, { ...NEUTRAL_LEVERS, group: 'Empresa 0', removeCompany: true }, FIXTURE_NOW,
    );
    const reducedPrepared = await prepareCombinationStudy(reduced, () => {});
    expect(reducedPrepared.scenarios).toHaveLength(3);
    expect(reducedPrepared.preparedCombinationCoverage?.companyIdsCanonical).toBe('["company-1","company-2"]');

    const restored = await updateScenario(reducedPrepared, base.id, {
      sourceSnapshot: base.sourceSnapshot,
    }, FIXTURE_NOW);
    const restoredPrepared = await prepareCombinationStudy(restored, () => {});
    expect(restoredPrepared.scenarios).toHaveLength(7);
    expect(restoredPrepared.preparedCombinationCoverage?.companyIdsCanonical).toBe('["company-0","company-1","company-2"]');
  });

  it('treats distinct company IDs with the same display name as distinct combinations', async () => {
    const prepared = await prepareCombinationStudy(await fixture(true), () => {});
    expect(prepared.scenarios).toHaveLength(7);
    const combinations = prepared.scenarios.slice(1).map((scenario) => {
      const source = scenario.sourceSnapshot.source;
      if (source.kind !== 'AUTHORED' || source.definition?.kind !== 'EXPLICIT_ORDERS') throw new Error('Origem inesperada.');
      const companyByOrder = source.definition.companyByOrder;
      return [...new Set(scenario.sourceSnapshot.orders.map((order) =>
        companyByOrder?.[order.id]?.companyId))].sort().join(',');
    });
    expect(combinations.sort()).toEqual([
      'company-0', 'company-0,company-1', 'company-0,company-2',
      'company-1', 'company-1,company-2', 'company-2',
    ].sort());
    expect(prepared.scenarios.filter((scenario) => scenario.name.includes('Empresa repetida'))).toHaveLength(5);
  });

  it('replaces derived scenarios and their results after sourceCases revision changes', async () => {
    const prepared = await prepareCombinationStudy(await fixture(), () => {});
    const oldDerived = prepared.scenarios[1]!;
    const withResult = await appendExecution(prepared, runningExecution(prepared, oldDerived.id), FIXTURE_NOW);
    const base = prepared.scenarios[0]!;
    const sourceSnapshot = structuredClone(base.sourceSnapshot) as DeepMutable<typeof base.sourceSnapshot>;
    if (sourceSnapshot.source.kind !== 'AUTHORED' || sourceSnapshot.source.definition?.kind !== 'EXPLICIT_ORDERS') {
      throw new Error('Origem inesperada.');
    }
    sourceSnapshot.source.definition.sourceCases![0]!.caseRevision += 1;
    const edited = await updateScenario(withResult, base.id, { sourceSnapshot }, FIXTURE_NOW);
    const next = await prepareCombinationStudy(edited, () => {});
    expect(next.scenarios).toHaveLength(7);
    expect(next.scenarios.some((scenario) => scenario.id === oldDerived.id)).toBe(false);
    expect(next.executions).toEqual([]);
    expect(await prepareCombinationStudy(next, () => {})).toBe(next);
  });

  it('replaces derived scenarios after order provenance changes without changing orders', async () => {
    const prepared = await prepareCombinationStudy(await fixture(), () => {});
    const base = prepared.scenarios[0]!;
    const sourceSnapshot = structuredClone(base.sourceSnapshot) as DeepMutable<typeof base.sourceSnapshot>;
    if (sourceSnapshot.source.kind !== 'AUTHORED' || sourceSnapshot.source.definition?.kind !== 'EXPLICIT_ORDERS') {
      throw new Error('Origem inesperada.');
    }
    const orderId = base.sourceSnapshot.orders[0]!.id;
    sourceSnapshot.source.definition.provenanceByOrder[orderId]!.valor_brl.source = 'Proveniência revista';
    sourceSnapshot.provenanceByOrder![orderId]!.valor_brl.source = 'Proveniência revista';
    const edited = await updateScenario(prepared, base.id, { sourceSnapshot }, FIXTURE_NOW);
    const next = await prepareCombinationStudy(edited, () => {});
    expect(next.scenarios.some((scenario) => scenario.id === prepared.scenarios[1]!.id)).toBe(false);
    expect(await prepareCombinationStudy(next, () => {})).toBe(next);
  });

  it('replaces derived scenarios when only input provenance changes', async () => {
    const prepared = await prepareCombinationStudy(await fixture(), () => {});
    const base = prepared.scenarios[0]!;
    const edited = await updateScenario(prepared, base.id, { inputProvenance }, FIXTURE_NOW);
    expect(edited.scenarios[0]!.inputFingerprint).toBe(base.inputFingerprint);
    const next = await prepareCombinationStudy(edited, () => {});
    expect(next.scenarios.some((scenario) => scenario.id === prepared.scenarios[1]!.id)).toBe(false);
    expect(next.scenarios[1]!.inputProvenance).toEqual(inputProvenance);
    expect(await prepareCombinationStudy(next, () => {})).toBe(next);
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
