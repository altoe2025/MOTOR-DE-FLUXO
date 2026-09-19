import { describe, expect, it } from 'vitest';

import {
  appendExecution,
  createStudy,
  duplicateStudy,
  moveStudyToTrash,
  renameStudy,
  updateScenario,
} from './domain';
import {
  FIXTURE_NOW,
  FIXTURE_OWNER,
  makeAuthoredSnapshot,
  makeObservedCase,
  makeObservedSnapshot,
  makeScenarioDraft,
  makeSyntheticSnapshot,
} from './fixtures';
import type { DeepMutable, ExecutionRecord, StudyDocument } from './model';

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
      periodo: structuredClone(scenario.period),
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

describe('agregado StudyDocument v2', () => {
  it.each([
    ['OBSERVED_CASE', makeObservedSnapshot()],
    ['AUTHORED', makeAuthoredSnapshot()],
    ['SYNTHETIC', makeSyntheticSnapshot()],
  ] as const)('cria estudo da origem %s sem compartilhar estado mutável', async (kind, snapshot) => {
    const study = await studyWith(snapshot);

    expect(study.scenarios[0]!.sourceSnapshot.source.kind).toBe(kind);
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

  it('renomeia e envia para lixeira em novos documentos sem alterar o fingerprint', async () => {
    const original = await studyWith();
    const renamed = renameStudy(original, 'Nome novo', NEXT);
    const trashed = moveStudyToTrash(renamed, '2026-09-19T14:00:00Z');

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
    const withExecution = appendExecution(original, executionFor(original), NEXT);
    const ids = [
      '00000000-0000-4000-8000-000000000040',
      '00000000-0000-4000-8000-000000000041',
    ];

    const duplicate = duplicateStudy(withExecution, '2026-09-19T14:00:00Z', () => ids.shift()!);

    expect(duplicate.id).toBe('00000000-0000-4000-8000-000000000040');
    expect(duplicate.baseScenarioId).toBe('00000000-0000-4000-8000-000000000041');
    expect(duplicate.scenarios[0]!.id).toBe(duplicate.baseScenarioId);
    expect(duplicate.executions).toEqual([]);
    expect(withExecution.executions).toHaveLength(1);
  });

  it('anexa execução por cópia e impede mutação retroativa', async () => {
    const original = await studyWith();
    const existing = executionFor(original);
    const appended = appendExecution(original, existing, NEXT);

    expect(original.executions).toEqual([]);
    expect(appended.executions).toHaveLength(1);
    expect(() => {
      (appended.executions[0] as DeepMutable<ExecutionRecord>).status = 'FAILED';
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
    expect(() => appendExecution(original, incompatible, NEXT))
      .toThrow('Documento de estudo inválido');
  });
});
