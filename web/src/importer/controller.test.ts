import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { PreviaRequest, PreviewEnvelope } from '../api/client';
import {
  ImportController,
  type ExecuteImportedPreviewInput,
  type ImportControllerPorts,
} from './controller';
import type { ImportCatalog, ImportStudy, ISODate, ProjectedOperation } from './domain';

const envelopeFixture = JSON.parse(readFileSync(
  resolve(process.cwd(), '../contracts/fixtures/reference-result.json'),
  'utf8',
)) as PreviewEnvelope;
const NOW = '2026-09-18T12:00:00Z';
const ORIGIN = {
  tipo: 'PADRAO_SINTETICO' as const,
  fonte: 'Teste',
  registrado_em_utc: NOW,
};
const STUDY: ImportStudy = {
  schemaVersion: '1.0.0',
  id: '00000000-0000-4000-8000-000000000021',
  revision: 3, name: 'Estudo', createdAtUtc: NOW, updatedAtUtc: NOW,
  batches: [], events: [],
};
const OPERATION: ProjectedOperation = {
  operationId: 'OP-1', versionId: 'version-1', batchId: 'batch-1',
  batchSequence: 1, rowNumber: 2, canonicalClientId: 'client-1',
  originVersionIds: ['version-1'],
  operation: {
    operationId: 'OP-1', clientName: 'Cliente', profileClassification: null,
    direction: 'OUT', knownDate: '2026-10-01' as ISODate,
    deadlineDate: '2026-10-02' as ISODate,
    valueBrl: '100', purposeCode: 'SERVICO',
  },
  audit: { edits: [] }, excluded: false, executable: true, issues: [],
};
const CATALOG: ImportCatalog = {
  schema_version: '1.0.0', catalog_version: 'a'.repeat(64),
  status: 'CONFIGURADO', publicado_em_utc: NOW,
  finalidades: [{
    codigo: 'SERVICO', descricao: 'Serviço fictício',
    aliquotas: [{ direcao: 'OUT', aliquota: '0.035' }],
  }],
  custos_padrao: {
    iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004',
    spread_rail_bps: '25', custo_fixo_remessa: '40',
    custo_oportunidade_aa: '0', ptax: '5.4', iof_por_finalidade: [],
  },
  custos_origem: ORIGIN, custos_calibrados: false,
};
const INPUT: ExecuteImportedPreviewInput = {
  ownerSub: 'owner-a', study: STUDY,
  assessment: {
    selected: [OPERATION], blockers: [], issues: [],
    omitted: { outsideRecut: 0, invalid: 0, excluded: 0, superseded: 0 },
    requiresPartialConfirmation: false, periodDays: 1,
  },
  catalog: CATALOG,
  parameters: {
    windowDays: 7, catalogVersion: CATALOG.catalog_version,
    costs: CATALOG.custos_padrao,
    fieldOrigins: {
      windowDays: ORIGIN, iof_out: ORIGIN, iof_in: ORIGIN, carry_cnr: ORIGIN,
      spread_rail_bps: ORIGIN, custo_fixo_remessa: ORIGIN,
      custo_oportunidade_aa: ORIGIN, ptax: ORIGIN, iof_por_finalidade: ORIGIN,
    },
  },
  recut: { start: '2026-10-01' as ISODate, end: '2026-10-01' as ISODate },
  attemptId: 'attempt-1',
  requestId: '00000000-0000-4000-8000-000000000022',
  scenarioId: '00000000-0000-4000-8000-000000000023',
  nowUtc: NOW,
};

function matchingEnvelope(request: PreviaRequest): PreviewEnvelope {
  return {
    ...structuredClone(envelopeFixture),
    request_id: request.request_id,
    study_id: request.study_id,
    scenario_id: request.scenario_id,
    scenario_revision: request.scenario_revision,
  };
}

function ports(overrides: Partial<ImportControllerPorts> = {}): ImportControllerPorts {
  return {
    executeRequest: vi.fn(async (request) => matchingEnvelope(request)),
    persistPending: vi.fn(async (study) => study),
    reserveAttempt: vi.fn(async () => undefined),
    saveExecution: vi.fn(async () => undefined),
    currentOwnerSub: vi.fn(() => 'owner-a'),
    currentStudyRevision: vi.fn(async () => STUDY.revision),
    ...overrides,
  };
}

describe('ImportController', () => {
  it('persiste, reserva por CAS, executa e salva uma única vez no duplo clique', async () => {
    const dependencies = ports();
    const controller = new ImportController(dependencies);

    const first = controller.execute(INPUT);
    const second = controller.execute(INPUT);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(firstResult).toBe(secondResult);
    expect(Object.isFrozen(firstResult)).toBe(true);
    expect(Object.isFrozen(firstResult?.input_snapshot)).toBe(true);
    expect(dependencies.persistPending).toHaveBeenCalledOnce();
    expect(dependencies.reserveAttempt).toHaveBeenCalledWith({
      studyId: STUDY.id, expectedRevision: 3, attemptId: 'attempt-1',
    });
    expect(dependencies.executeRequest).toHaveBeenCalledOnce();
    expect(dependencies.saveExecution).toHaveBeenCalledOnce();
    expect(controller.state).toEqual({ status: 'REVIEW', studyId: STUDY.id });
  });

  it('salva resposta atrasada como histórico da revisão enviada', async () => {
    const dependencies = ports({
      currentStudyRevision: vi.fn(async () => STUDY.revision + 1),
    });
    const controller = new ImportController(dependencies);

    await controller.execute(INPUT);

    expect(dependencies.saveExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        studyRevision: STUDY.revision,
        catalogVersion: CATALOG.catalog_version,
        current: false,
      }),
    );
  });

  it('descarta resposta quando a conta muda durante o POST', async () => {
    let resolve!: (value: PreviewEnvelope) => void;
    let sent!: PreviaRequest;
    let owner: string | null = 'owner-a';
    const dependencies = ports({
      currentOwnerSub: vi.fn(() => owner),
      executeRequest: vi.fn((request) => {
        sent = request;
        return new Promise<PreviewEnvelope>((next) => { resolve = next; });
      }),
    });
    const controller = new ImportController(dependencies);
    const execution = controller.execute(INPUT);
    await vi.waitFor(() => expect(dependencies.executeRequest).toHaveBeenCalledOnce());

    owner = 'owner-b';
    resolve(matchingEnvelope(sent));
    const result = await execution;

    expect(result).toBeNull();
    expect(dependencies.saveExecution).not.toHaveBeenCalled();
    expect(controller.state).toEqual({ status: 'IDLE' });
  });

  it('não salva resposta com identidade divergente', async () => {
    const dependencies = ports({
      executeRequest: vi.fn(async (request) => ({
        ...matchingEnvelope(request),
        scenario_revision: request.scenario_revision + 1,
      })),
    });
    const controller = new ImportController(dependencies);

    const result = await controller.execute(INPUT);

    expect(result).toBeNull();
    expect(dependencies.saveExecution).not.toHaveBeenCalled();
    expect(controller.state).toMatchObject({
      status: 'FAILURE', phase: 'EXECUTE',
    });
  });

  it('tenta salvar novamente sem repetir o POST', async () => {
    const saveExecution = vi.fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const dependencies = ports({ saveExecution });
    const controller = new ImportController(dependencies);

    const envelope = await controller.execute(INPUT);

    expect(envelope).not.toBeNull();
    expect(controller.state).toMatchObject({ status: 'FAILURE', phase: 'SAVE' });
    expect(controller.canRetrySave).toBe(true);
    await controller.retrySave();
    expect(dependencies.executeRequest).toHaveBeenCalledOnce();
    expect(saveExecution).toHaveBeenCalledTimes(2);
    expect(controller.canRetrySave).toBe(false);
    expect(controller.state).toEqual({ status: 'REVIEW', studyId: STUDY.id });
  });
});
