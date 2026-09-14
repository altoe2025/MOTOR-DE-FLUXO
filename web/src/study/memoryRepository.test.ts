import { describe, expect, it } from 'vitest';

import { resolveInput } from './domain';
import { makeExecution } from './executionFixture.test-support';
import { makeStudy } from './fixtures';
import { MemoryStudyRepository } from './memoryRepository';
import type { PreparationRecord, Scope, StudyDocument } from './model';
import type { RepoError } from './repository';

const SCOPE: Scope = {
  project_ref: 'projeto-sintetico',
  owner_sub: '00000000-0000-4000-8000-000000000001',
};
const OPERATION_A = '00000000-0000-4000-8000-000000000401';
const OPERATION_B = '00000000-0000-4000-8000-000000000402';

async function expectCode(promise: Promise<unknown>, code: RepoError['code']): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('MemoryStudyRepository', () => {
  it('não reutiliza uma operação de save para apagar ou restaurar', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const study = await repository.save(makeStudy(SCOPE), { expected_revision: null, operation_id: OPERATION_A });
    await expectCode(repository.trash(study.id, { expected_revision: 1, operation_id: OPERATION_A }), 'INVALID_DOCUMENT');
    expect((await repository.get(study.id))?.deleted_at).toBeNull();
  });

  it('recusa falha pública inválida sem encerrar a tentativa', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const study = makeStudy(SCOPE);
    study.attempt = {
      id: OPERATION_B, request_id: '00000000-0000-4000-8000-000000000421',
      tab_id: OPERATION_A, session_epoch: 1, scenario_revision: 1,
      started_at: '2026-09-13T00:00:00Z', phase: 'EXECUTANDO',
    };
    await repository.save(study, { expected_revision: null, operation_id: OPERATION_A });
    await expectCode(repository.finishAttempt(study.id, OPERATION_B, {
      code: '', message: '', fields: [], request_id: null,
    }), 'INVALID_DOCUMENT');
    expect((await repository.get(study.id))?.attempt).toEqual(study.attempt);
  });

  it('repetir execução idêntica não depende de tentativa ainda ativa', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const study = makeStudy(SCOPE);
    study.attempt = {
      id: OPERATION_B, request_id: '00000000-0000-4000-8000-000000000421',
      tab_id: OPERATION_A, session_epoch: 1, scenario_revision: 1,
      started_at: '2026-09-13T00:00:00Z', phase: 'EXECUTANDO',
    };
    await repository.save(study, { expected_revision: null, operation_id: OPERATION_A });
    const record = makeExecution(study);
    const saved = await repository.appendExecution(study.id, OPERATION_B, record);
    expect(await repository.appendExecution(study.id, OPERATION_B, structuredClone(record))).toEqual(saved);
    expect(saved.execution_ids).toEqual([record.id]);
    await expectCode(repository.appendExecution(study.id, OPERATION_B, {
      ...record, numeric_key: 'c'.repeat(64),
    }), 'DOCUMENT_CORRUPT');
  });

  it('preserva edição feita enquanto a preparação estava em voo', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const study = makeStudy(SCOPE);
    study.attempt = {
      id: OPERATION_B, request_id: '00000000-0000-4000-8000-000000000421',
      tab_id: OPERATION_A, session_epoch: 1, scenario_revision: 1,
      started_at: '2026-09-13T00:00:00Z', phase: 'PREPARANDO',
    };
    const saved = await repository.save(study, { expected_revision: null, operation_id: OPERATION_A });
    const record = preparationRecord(saved);
    if (saved.content.kind !== 'AUTHORED') throw new Error('fixture');
    saved.content.input.participants[0]!.seed = '99';
    saved.semantic_key = 'c'.repeat(64);
    const edited = await repository.save(saved, { expected_revision: 1, operation_id: '00000000-0000-4000-8000-000000000403' });
    const received = await repository.savePreparation(study.id, OPERATION_B, record);
    expect(received.content).toEqual(edited.content);
    expect(received.current_preparation_id).toBeNull();
    expect(await repository.getPreparation(record.id)).toEqual(record);
  });

  it('não permite que mutação do scope do chamador troque o proprietário', async () => {
    const scope = { ...SCOPE };
    const repository = new MemoryStudyRepository(scope);
    scope.owner_sub = '00000000-0000-4000-8000-000000000099';
    await expectCode(repository.save(makeStudy(scope), {
      expected_revision: null, operation_id: OPERATION_A,
    }), 'OWNER_MISMATCH');
  });

  it('valida o registro de preparação completo antes de persistir', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const study = makeStudy(SCOPE);
    study.attempt = {
      id: OPERATION_B, request_id: '00000000-0000-4000-8000-000000000421',
      tab_id: OPERATION_A, session_epoch: 1, scenario_revision: 1,
      started_at: '2026-09-13T00:00:00Z', phase: 'PREPARANDO',
    };
    await repository.save(study, { expected_revision: null, operation_id: OPERATION_A });
    const record = { ...preparationRecord(study), extra: 'proibido' };
    await expectCode(repository.savePreparation(study.id, OPERATION_B, record), 'INVALID_DOCUMENT');
    expect(await repository.getPreparation(record.id)).toBeNull();
  });

  it('associa preparação vigente e avança a tentativa para execução', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const study = makeStudy(SCOPE);
    study.attempt = {
      id: OPERATION_B, request_id: '00000000-0000-4000-8000-000000000421',
      tab_id: OPERATION_A, session_epoch: 1, scenario_revision: 1,
      started_at: '2026-09-13T00:00:00Z', phase: 'PREPARANDO',
    };
    const saved = await repository.save(study, { expected_revision: null, operation_id: OPERATION_A });
    const record = preparationRecord(saved);
    const prepared = await repository.savePreparation(study.id, OPERATION_B, record);
    expect(prepared.current_preparation_id).toBe(record.id);
    expect(prepared.attempt?.phase).toBe('EXECUTANDO');
  });

  it('persiste raw incompleto, mas recusa relações e extras inválidos', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const draft = makeStudy(SCOPE);
    if (draft.content.kind !== 'AUTHORED') throw new Error('fixture');
    draft.content.input.groups[0]!.fields.monthly_volume_brl.raw = '1,';
    const saved = await repository.save(draft, { expected_revision: null, operation_id: OPERATION_A });
    expect(saved.content).toMatchObject({
      kind: 'AUTHORED', input: { groups: [{ fields: { monthly_volume_brl: { raw: '1,' } } }] },
    });

    const duplicate = makeStudy(SCOPE, { study: '00000000-0000-4000-8000-000000000410' });
    if (duplicate.content.kind !== 'AUTHORED') throw new Error('fixture');
    duplicate.content.input.participants.push(structuredClone(duplicate.content.input.participants[0]!));
    await expectCode(repository.save(duplicate, {
      expected_revision: null,
      operation_id: OPERATION_B,
    }), 'INVALID_DOCUMENT');

    const extra = makeStudy(SCOPE, { study: '00000000-0000-4000-8000-000000000411' });
    (extra as StudyDocument & { token?: string }).token = 'não persistir';
    await expectCode(repository.save(extra, {
      expected_revision: null,
      operation_id: OPERATION_B,
    }), 'INVALID_DOCUMENT');
  });

  it('vincula o repositório ao scope confiável', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const other = makeStudy({ ...SCOPE, owner_sub: '00000000-0000-4000-8000-000000000099' });
    await expectCode(repository.save(other, {
      expected_revision: null,
      operation_id: OPERATION_A,
    }), 'OWNER_MISMATCH');
  });

  it('aplica CAS, incrementa revisão e reconhece repetição da mesma operação', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const created = await repository.save(makeStudy(SCOPE), {
      expected_revision: null,
      operation_id: OPERATION_A,
    });
    expect(created.revision).toBe(1);

    const update = structuredClone(created);
    update.name = 'Nome atualizado';
    update.updated_at = '2026-09-13T01:00:00Z';
    update.last_operation_id = OPERATION_B;
    const saved = await repository.save(update, { expected_revision: 1, operation_id: OPERATION_B });
    expect(saved.revision).toBe(2);
    expect(saved.name).toBe('Nome atualizado');

    await expectCode(repository.save({ ...saved, deleted_at: '2026-09-13T02:00:00Z' }, {
      expected_revision: 2, operation_id: '00000000-0000-4000-8000-000000000404',
    }), 'INVALID_DOCUMENT');

    expect(await repository.save(update, {
      expected_revision: 1,
      operation_id: OPERATION_B,
    })).toEqual(saved);
    await expectCode(repository.save({ ...update, name: 'Outra intenção' }, {
      expected_revision: 1, operation_id: OPERATION_B,
    }), 'INVALID_DOCUMENT');
    await expectCode(repository.save({ ...update, name: 'Conflito' }, {
      expected_revision: 1,
      operation_id: '00000000-0000-4000-8000-000000000403',
    }), 'REVISION_CONFLICT');
  });

  it('retorna clones e resumos filtrados por lixeira', async () => {
    const repository = new MemoryStudyRepository(SCOPE, () => '2026-09-13T02:00:00Z');
    const created = await repository.save(makeStudy(SCOPE), {
      expected_revision: null,
      operation_id: OPERATION_A,
    });
    const loaded = await repository.get(created.id);
    if (loaded === null) throw new Error('estudo ausente');
    loaded.name = 'Mutação externa';
    expect((await repository.get(created.id))?.name).toBe('Estudo sintético');

    await repository.trash(created.id, { expected_revision: 1, operation_id: OPERATION_B });
    expect(await repository.list(false)).toEqual([]);
    expect(await repository.list(true)).toEqual([
      expect.objectContaining({ id: created.id, deleted_at: '2026-09-13T02:00:00Z' }),
    ]);
  });

  it('fecha o repositório sem expor dados depois do encerramento', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    repository.close();
    await expectCode(repository.list(false), 'STORAGE_CLOSED');
    await expectCode(repository.get('00000000-0000-4000-8000-000000000020'), 'STORAGE_CLOSED');
  });

  it('recusa operation_id que tornaria o documento armazenado inválido', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    await expectCode(repository.save(makeStudy(SCOPE), {
      expected_revision: null,
      operation_id: 'operação-inválida',
    }), 'INVALID_DOCUMENT');
  });

  it('recusa preparação de outro cenário antes de armazená-la', async () => {
    const repository = new MemoryStudyRepository(SCOPE);
    const study = makeStudy(SCOPE);
    study.attempt = {
      id: '00000000-0000-4000-8000-000000000420',
      request_id: '00000000-0000-4000-8000-000000000421',
      tab_id: '00000000-0000-4000-8000-000000000422',
      session_epoch: 1,
      scenario_revision: 1,
      started_at: '2026-09-13T00:00:00Z',
      phase: 'PREPARANDO',
    };
    const created = await repository.save(study, {
      expected_revision: null,
      operation_id: OPERATION_A,
    });
    const record = preparationRecord(created);
    record.envelope.scenario_id = '00000000-0000-4000-8000-000000000499';
    await expectCode(repository.savePreparation(created.id, study.attempt.id, record), 'INVALID_DOCUMENT');
    expect(await repository.getPreparation(record.id)).toBeNull();
  });
});

function preparationRecord(study: StudyDocument): PreparationRecord {
  if (study.content.kind !== 'AUTHORED') throw new Error('fixture');
  const resolved = resolveInput(study.content.input);
  if (!resolved.ok) throw new Error('fixture inválida');
  const preparationId = '00000000-0000-4000-8000-000000000430';
  return {
    record_version: '1.0.0',
    id: preparationId,
    study_id: study.id,
    scope: structuredClone(study.scope),
    received_at: '2026-09-13T00:00:00Z',
    envelope: {
      preparation_version: '1.0.0',
      preparation_id: preparationId,
      request_id: '00000000-0000-4000-8000-000000000421',
      study_id: study.id,
      scenario_id: study.scenario_id,
      scenario_revision: study.scenario_revision,
      created_at: '2026-09-13T00:00:00Z',
      motor_build_sha: 'a'.repeat(40),
      generator_version: 'dimensionamento-v1',
      catalog_version: '1.0.0',
      generation_fingerprint: 'b'.repeat(64),
      input_snapshot: resolved.value,
      orders: [],
      parameters: [],
      composition: [],
      derived_provenance: {},
    },
  };
}
