import { describe, expect, it } from 'vitest';

import stage2Database from './__fixtures__/application-database-v1-stage2.json';
import type { DeepMutable, StudyDocumentV2, StudyDocumentV3 } from '../study/model';
import { migrateStudyDocumentV2 } from '../study/model';
import { parseStudyV3 } from '../study/validation';

type Stage2StudyRow = (typeof stage2Database.stores.studies)[number];
type Stage2ExecutionRow = (typeof stage2Database.stores.executions)[number];

function stage2Study(): StudyDocumentV2 {
  const row = stage2Database.stores.studies.find(
    (candidate: Stage2StudyRow) => candidate.document.scenarios[0]?.sourceSnapshot.source.kind === 'SYNTHETIC',
  );
  if (row === undefined) throw new Error('Fixture Stage 2 sem estudo sintético.');
  const executions = stage2Database.stores.executions
    .filter((candidate: Stage2ExecutionRow) => candidate.study_id === row.study_id)
    .sort((left: Stage2ExecutionRow, right: Stage2ExecutionRow) => left.sequence - right.sequence)
    .map((candidate: Stage2ExecutionRow) => candidate.document);
  return structuredClone({ ...row.document, executions }) as unknown as StudyDocumentV2;
}

function mutableV3(): DeepMutable<StudyDocumentV3> {
  return structuredClone(migrateStudyDocumentV2(stage2Study())) as DeepMutable<StudyDocumentV3>;
}

describe('contrato persistido da Etapa 3', () => {
  it('congela uma fixture física V1 real com as três origens e reserva mais terminal', () => {
    expect(stage2Database).toMatchObject({
      version: 1,
      stores: { meta: [{ key: 'schema_version', value: 1 }] },
    });
    expect(stage2Database.stores.studies.map(
      (row: Stage2StudyRow) => row.document.scenarios[0]?.sourceSnapshot.source.kind,
    )).toEqual(['OBSERVED_CASE', 'AUTHORED', 'SYNTHETIC']);
    expect(stage2Database.stores.executions.map(
      (row: Stage2ExecutionRow) => [row.document.attemptId, row.document.status],
    )).toEqual([
      ['00000000-0000-4000-8000-000000000410', 'RUNNING'],
      ['00000000-0000-4000-8000-000000000410', 'SUCCEEDED'],
    ]);
  });

  it('migra V2 sem fabricar evidência nem receita geradora ausente', () => {
    const stage2 = stage2Study();
    const migrated = parseStudyV3(stage2);

    expect(migrated).toMatchObject({
      schemaVersion: '3.0.0',
      evidenceSnapshots: [],
    });
    expect(migrated.executions.every((item) => item.kind === 'PREVIEW')).toBe(true);
    expect(migrated.scenarios).toEqual(stage2.scenarios);
    expect('generationInputSnapshot' in migrated.scenarios[0]!.sourceSnapshot).toBe(false);
  });

  it.each(['UNKNOWN', 'DIAGNOSTIC'])('rejeita kind de execução ainda não suportado: %s', (kind) => {
    const candidate = mutableV3();
    candidate.executions[0]!.kind = kind as 'PREVIEW';

    expect(() => parseStudyV3(candidate)).toThrow('Documento de estudo V3 inválido.');
  });

  it('rejeita segundo terminal PREVIEW para o mesmo attemptId', () => {
    const candidate = mutableV3();
    const terminal = candidate.executions[1]!;
    const duplicate = structuredClone(terminal);
    duplicate.id = '00000000-0000-4000-8000-000000000412';
    duplicate.requestSnapshot.request_id = '00000000-0000-4000-8000-000000000402';
    duplicate.envelope!.execution_id = duplicate.id;
    duplicate.envelope!.request_id = duplicate.requestSnapshot.request_id;
    candidate.executions.push(duplicate);

    expect(() => parseStudyV3(candidate)).toThrow('Tentativa possui mais de um terminal persistido.');
  });

  it('rejeita envelope que não pertence a PREVIEW', () => {
    const candidate = mutableV3();
    candidate.executions[1]!.envelope = { job_id: 'diagnostic-job' } as never;

    expect(() => parseStudyV3(candidate)).toThrow('Documento de estudo V3 inválido.');
  });

  it('mantém evidenceSnapshots fechado e rejeita perfil ainda sem contrato', () => {
    const candidate = mutableV3();
    candidate.evidenceSnapshots.push({
      kind: 'OPERATIONAL_PROFILE',
      capturedAt: '2026-09-20T00:00:00Z',
      profile: { schemaVersion: '1.0.0', version: 1 },
    } as never);

    expect(() => parseStudyV3(candidate)).toThrow('Documento de estudo V3 inválido.');
  });
});
