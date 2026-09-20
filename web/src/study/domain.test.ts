import { describe, expect, it } from 'vitest';

import {
  attachOperationalProfileEvidence,
  appendExecution,
  createStudy,
  duplicateStudy,
  moveStudyToTrash,
  renameStudy,
  updateScenario,
} from './domain';
import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import { fingerprintPortfolioSource } from './fingerprints';
import {
  FIXTURE_NOW,
  FIXTURE_OWNER,
  makeAuthoredSnapshot,
  makeObservedCase,
  makeObservedSnapshot,
  makeScenarioDraft,
  makeSyntheticSnapshot,
} from './fixtures';
import type { DeepMutable, ExecutionRecord, PreviewExecutionRecord, StudyDocument } from './model';
import type { OperationalProfileVersion } from '../profiles/domain';

const NEXT = '2026-09-19T13:00:00Z';

async function studyWith(sourceSnapshot = makeSyntheticSnapshot()) {
  return createStudy({
    id: '00000000-0000-4000-8000-000000000020',
    ownerSub: FIXTURE_OWNER,
    name: 'Estudo v2',
    baseScenario: makeScenarioDraft({ sourceSnapshot }),
    now: FIXTURE_NOW,
  });
}

function executionFor(study: StudyDocument): ExecutionRecord {
  const scenario = study.scenarios[0]!;
  return {
    id: '00000000-0000-4000-8000-000000000030',
    scenarioId: scenario.id,
    scenarioRevision: scenario.revision,
    inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: {
      api_version: '1.0.0',
      request_id: '00000000-0000-4000-8000-000000000031',
      study_id: study.id,
      scenario_id: scenario.id,
      scenario_revision: scenario.revision,
      cenario: {
        ordens: structuredClone(scenario.sourceSnapshot.orders),
        horizonte_dias: 30,
        janela_dias: scenario.premises.windowDays,
        custo: structuredClone(scenario.premises.costs),
      },
      periodo: structuredClone(scenario.period.httpPeriod),
      proveniencia: {},
    },
    engineVersion: 'a'.repeat(40),
    contractVersion: '1.0.0',
    status: 'RUNNING',
    envelope: null,
    observedComparison: null,
    createdAt: NEXT,
    finishedAt: null,
  };
}

describe('agregado StudyDocument V3', () => {
  it.each([
    ['OBSERVED_CASE', makeObservedSnapshot()],
    ['AUTHORED', makeAuthoredSnapshot()],
    ['SYNTHETIC', makeSyntheticSnapshot()],
  ] as const)('cria estudo da origem %s sem compartilhar estado mutável', async (kind, snapshot) => {
    const study = await studyWith(snapshot);

    expect(study.scenarios[0]!.sourceSnapshot.source.kind).toBe(kind);
    expect(study.scenarios[0]!.sourceSnapshot.sourceFingerprint).toBe(
      await fingerprintPortfolioSource(study.scenarios[0]!.sourceSnapshot),
    );
    expect(study.scenarios[0]!.sourceSnapshot.sourceFingerprint)
      .not.toBe(snapshot.sourceFingerprint);
    expect(Object.isFrozen(study)).toBe(true);
    snapshot.orders[0]!.valor_brl = '999';
    expect(study.scenarios[0]!.sourceSnapshot.orders[0]!.valor_brl).not.toBe('999');
  });

  it('conserva revisão, ordens, proveniência e resultado do Caso Observado sem modificá-lo', async () => {
    const caseRecord = makeObservedCase();
    const before = structuredClone(caseRecord);
    const snapshot = makeObservedSnapshot(caseRecord);
    const study = await studyWith(snapshot);
    const stored = study.scenarios[0]!.sourceSnapshot;

    expect(stored.source).toEqual({
      kind: 'OBSERVED_CASE', caseId: caseRecord.id, caseRevision: caseRecord.revision,
    });
    expect(stored.orders).toEqual(snapshot.orders);
    expect(stored.provenance).toEqual(caseRecord.orders[0]!.provenance);
    expect(stored.observedOutcome).toEqual(caseRecord.observedOutcome);
    expect(caseRecord).toEqual(before);
  });

  it('preserva seed int64 textual e composição T2 no round-trip sintético', async () => {
    const snapshot = makeSyntheticSnapshot();
    if (snapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture');
    snapshot.source.recipe.seeds = ['9223372036854775807'];
    snapshot.source.recipe.composition = [{
      participant_id: null,
      order_count: 2,
      total_brl: '170',
      out_brl: '100',
      in_brl: '70',
      out_fraction: '0.588235294118',
    }];

    const study = await studyWith(snapshot);
    const roundTrip = JSON.parse(JSON.stringify(study)) as StudyDocument;
    const source = roundTrip.scenarios[0]!.sourceSnapshot.source;
    if (source.kind !== 'SYNTHETIC') throw new Error('round-trip perdeu origem');

    expect(source.recipe.seeds).toEqual(['9223372036854775807']);
    expect(source.recipe.composition).toEqual(snapshot.source.recipe.composition);
  });

  it('recusa seed textual acima do int64 aceito por T2', async () => {
    const snapshot = makeSyntheticSnapshot();
    if (snapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture');
    snapshot.source.recipe.seeds = ['9223372036854775808'];

    await expect(studyWith(snapshot)).rejects.toThrow('Documento de estudo inválido');
  });

  it('persiste horizonte executável legado e o inclui no fingerprint global', async () => {
    const period30 = {
      httpPeriod: { modo: 'LEGADO' as const },
      executableHorizonDays: 30,
    };
    const period31 = { ...period30, executableHorizonDays: 31 };
    const first = await createStudy({
      id: 'study-legacy-30', ownerSub: FIXTURE_OWNER, name: 'Legado 30',
      baseScenario: makeScenarioDraft({ period: period30 }), now: FIXTURE_NOW,
    });
    const second = await createStudy({
      id: 'study-legacy-31', ownerSub: FIXTURE_OWNER, name: 'Legado 31',
      baseScenario: makeScenarioDraft({ period: period31 }), now: FIXTURE_NOW,
    });

    expect(first.scenarios[0]!.period).toEqual(period30);
    expect(second.scenarios[0]!.inputFingerprint)
      .not.toBe(first.scenarios[0]!.inputFingerprint);
  });

  it('renomeia e envia para lixeira em novos documentos sem alterar o fingerprint', async () => {
    const original = await studyWith();
    const renamed = await renameStudy(original, 'Nome novo', NEXT);
    const trashed = await moveStudyToTrash(renamed, '2026-09-19T14:00:00Z');

    expect(renamed).not.toBe(original);
    expect(renamed.name).toBe('Nome novo');
    expect(renamed.revision).toBe(2);
    expect(renamed.scenarios[0]!.inputFingerprint).toBe(original.scenarios[0]!.inputFingerprint);
    expect(original.name).toBe('Estudo v2');
    expect(trashed.deletedAt).toBe('2026-09-19T14:00:00Z');
    expect(trashed.revision).toBe(3);
  });

  it('atualiza cenário, avança revisão e recalcula o fingerprint global', async () => {
    const original = await studyWith();
    const premises = structuredClone(original.scenarios[0]!.premises) as DeepMutable<
      typeof original.scenarios[0]['premises']
    >;
    premises.costs.iof_out = '0.04';

    const updated = await updateScenario(
      original,
      original.baseScenarioId,
      { premises },
      NEXT,
    );

    expect(updated.scenarios[0]!.revision).toBe(2);
    expect(updated.scenarios[0]!.inputFingerprint)
      .not.toBe(original.scenarios[0]!.inputFingerprint);
    expect(original.scenarios[0]!.premises.costs.iof_out).toBe('0.035');
  });

  it('duplica cenários com novos IDs e sem copiar execuções', async () => {
    const original = await studyWith();
    const withExecution = await appendExecution(original, executionFor(original), NEXT);
    const ids = [
      '00000000-0000-4000-8000-000000000040',
      '00000000-0000-4000-8000-000000000041',
    ];

    const duplicate = await duplicateStudy(
      withExecution,
      '2026-09-19T14:00:00Z',
      () => ids.shift()!,
    );

    expect(duplicate.id).toBe('00000000-0000-4000-8000-000000000040');
    expect(duplicate.baseScenarioId).toBe('00000000-0000-4000-8000-000000000041');
    expect(duplicate.scenarios[0]!.id).toBe(duplicate.baseScenarioId);
    expect(duplicate.executions).toEqual([]);
    expect(withExecution.executions).toHaveLength(1);
  });

  it('anexa execução por cópia e impede mutação retroativa', async () => {
    const original = await studyWith();
    const existing = executionFor(original);
    const appended = await appendExecution(original, existing, NEXT);

    expect(original.executions).toEqual([]);
    expect(appended.executions).toHaveLength(1);
    expect(() => {
      (appended.executions[0] as unknown as DeepMutable<PreviewExecutionRecord>).status = 'FAILED';
    }).toThrow();
    expect(() => {
      (existing as DeepMutable<ExecutionRecord>).status = 'FAILED';
    }).not.toThrow();
    expect(appended.executions[0]!.status).toBe('RUNNING');
  });

  it('não retorna documento inválido ao atualizar ou anexar', async () => {
    const original = await studyWith();
    const invalidPremises = structuredClone(original.scenarios[0]!.premises) as DeepMutable<
      typeof original.scenarios[0]['premises']
    >;
    invalidPremises.windowDays = 0;
    await expect(updateScenario(
      original,
      original.baseScenarioId,
      { premises: invalidPremises },
      NEXT,
    )).rejects.toThrow('Documento de estudo inválido');

    const incompatible = executionFor(original) as DeepMutable<ExecutionRecord>;
    incompatible.requestSnapshot.study_id = '00000000-0000-4000-8000-000000000099';
    await expect(appendExecution(original, incompatible, NEXT))
      .rejects.toThrow('Documento de estudo inválido');
  });
});

describe('evidência de Perfil Operacional no Study V3', () => {
  async function operationalProfile(
    overrides: Partial<{ id: string; createdAt: string }> = {},
  ): Promise<OperationalProfileVersion> {
    const observed = { ...makeObservedCase(), ownerSub: FIXTURE_OWNER };
    return calculateOperationalProfile({
      id: overrides.id ?? 'profile-evidence-1',
      ownerSub: FIXTURE_OWNER,
      companyId: observed.companyId,
      version: 1,
      createdAt: overrides.createdAt ?? '2026-09-20T14:00:00Z',
      cases: [observed],
    });
  }

  it('attaches a complete detached profile and is idempotent by id plus fingerprint', async () => {
    const original = await studyWith();
    const profile = await operationalProfile();
    const attached = await attachOperationalProfileEvidence(
      original,
      profile,
      '2026-09-20T15:00:00Z',
    );

    expect(attached).not.toBe(original);
    expect(attached.evidenceSnapshots).toEqual([{
      kind: 'OPERATIONAL_PROFILE',
      capturedAt: '2026-09-20T15:00:00Z',
      profile,
    }]);
    expect(attached.evidenceSnapshots[0]!.profile).not.toBe(profile);
    expect(Object.isFrozen(attached.evidenceSnapshots[0]!.profile)).toBe(true);
    expect(await attachOperationalProfileEvidence(
      attached,
      structuredClone(profile),
      '2026-09-20T16:00:00Z',
    )).toBe(attached);
  });

  it('rejects an invalid profile and the same profile id with another valid fingerprint', async () => {
    const original = await studyWith();
    const profile = await operationalProfile();
    const attached = await attachOperationalProfileEvidence(original, profile, NEXT);
    const changed = await operationalProfile({ createdAt: '2026-09-20T18:00:00Z' });
    await expect(attachOperationalProfileEvidence(attached, changed, NEXT))
      .rejects.toThrow('Perfil Operacional');

    const corrupt = structuredClone(profile) as DeepMutable<OperationalProfileVersion>;
    corrupt.documentFingerprint = '0'.repeat(64);
    await expect(attachOperationalProfileEvidence(original, corrupt, NEXT))
      .rejects.toThrow('Perfil Operacional');
  });
});
