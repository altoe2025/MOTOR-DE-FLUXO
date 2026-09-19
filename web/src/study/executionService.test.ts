import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { PreviaRequest, PreviewEnvelope } from '../api/client';
import { ApiError } from '../api/errors';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { buildPreviewRequest, type PreviewRequestProvenance } from '../preparation/buildPreviewRequest';
import type {
  ApplicationRepository,
  CASMutation,
  ConfirmObservedCaseMutation,
} from '../storage/applicationRepository';
import { createStudy, updateScenario } from './domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from './fixtures';
import type { DeepMutable, StudyDocument } from './model';
import { StudyController } from './studyController';
import { executeStudyScenario } from './executionService';

const envelopeFixture = JSON.parse(readFileSync(
  resolve(process.cwd(), '../contracts/fixtures/reference-result.json'), 'utf8',
)) as PreviewEnvelope;

const provenance = Object.fromEntries([
  '/horizonte_dias', '/janela_dias', '/custo/iof_out', '/custo/iof_in',
  '/custo/carry_cnr', '/custo/custo_fixo_remessa', '/custo/custo_oportunidade_aa',
  '/custo/spread_rail_bps', '/custo/ptax',
].map((path) => [path, {
  kind: 'SYNTHETIC_DEFAULT' as const,
  source: 'fixture', version: '1', recordedAt: FIXTURE_NOW, rule: 'fixture',
}])) as Record<string, PreviewRequestProvenance['period']['horizonDays']>;

const requestProvenance: PreviewRequestProvenance = {
  premises: {
    windowDays: provenance['/janela_dias']!,
    costs: {
      iof_out: provenance['/custo/iof_out']!, iof_in: provenance['/custo/iof_in']!,
      carry_cnr: provenance['/custo/carry_cnr']!,
      custo_fixo_remessa: provenance['/custo/custo_fixo_remessa']!,
      custo_oportunidade_aa: provenance['/custo/custo_oportunidade_aa']!,
      spread_rail_bps: provenance['/custo/spread_rail_bps']!, ptax: provenance['/custo/ptax']!,
    },
  },
  period: { horizonDays: provenance['/horizonte_dias']! },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

class MemoryRepository implements ApplicationRepository {
  document: StudyDocument | null;
  readonly saves: CASMutation<StudyDocument>[] = [];
  failOnSave = 0;
  constructor(document: StudyDocument) { this.document = document; }
  async listCompanies(): Promise<CompanyRecord[]> { return []; }
  async listObservedCases(): Promise<ObservedCase[]> { return []; }
  async getObservedCase(): Promise<ObservedCase | null> { return null; }
  async confirmObservedCase(input: ConfirmObservedCaseMutation): Promise<ObservedCase> { return input.observedCase; }
  async listStudies(): Promise<StudyDocument[]> { return this.document === null ? [] : [this.document]; }
  async getStudy(): Promise<StudyDocument | null> { return this.document; }
  async saveStudy(input: CASMutation<StudyDocument>): Promise<StudyDocument> {
    this.saves.push(input);
    if (this.failOnSave === this.saves.length) throw new Error('quota');
    if (this.document?.revision !== input.expectedRevision) throw new Error('CAS');
    this.document = input.document;
    return input.document;
  }
  async restoreStudy(): Promise<StudyDocument> { throw new Error('não usado'); }
  async purgeStudy(): Promise<void> {}
  close(): void {}
}

async function setup() {
  const study = await createStudy({
    id: '00000000-0000-4000-8000-000000000020', ownerSub: FIXTURE_OWNER,
    name: 'Estudo', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW,
  });
  const repository = new MemoryRepository(study);
  let operation = 0;
  const controller = new StudyController({
    repositoryFactory: () => repository,
    channelFactory: () => ({
      postMessage() {}, addEventListener() {}, removeEventListener() {}, close() {},
    }),
    operationId: () => `operation-${++operation}`,
    autosaveDelayMs: 60_000,
  });
  await controller.switchSession(FIXTURE_OWNER);
  await controller.loadStudy(study.id);
  let id = 30;
  let minute = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`;
  const now = () => `2026-09-19T12:${String(++minute).padStart(2, '0')}:00Z`;
  const buildRequest = (context: Parameters<Parameters<typeof executeStudyScenario>[0]['buildRequest']>[0]) =>
    buildPreviewRequest(context.scenario.sourceSnapshot, context.scenario.premises, context.scenario.period, {
      requestId: context.requestId,
      studyId: context.study.id,
      scenarioId: context.scenario.id,
      scenarioRevision: context.scenario.revision,
    }, requestProvenance);
  return { study, repository, controller, nextId, now, buildRequest };
}

function matchingEnvelope(input: PreviaRequest, executionId: string): PreviewEnvelope {
  return {
    ...structuredClone(envelopeFixture),
    execution_id: executionId,
    request_id: input.request_id,
    study_id: input.study_id,
    scenario_id: input.scenario_id,
    scenario_revision: input.scenario_revision,
    input_snapshot: {
      cenario: structuredClone(input.cenario), periodo: structuredClone(input.periodo),
      proveniencia: structuredClone(input.proveniencia),
    },
  };
}

describe('executeStudyScenario', () => {
  it('faz flush de edição pendente antes de capturar snapshot e construir request', async () => {
    const subject = await setup();
    const current = subject.controller.snapshot.document!;
    const premises = structuredClone(current.scenarios[0]!.premises) as DeepMutable<typeof current.scenarios[0]['premises']>;
    premises.costs.iof_out = '0.04';
    const edited = await updateScenario(current, current.baseScenarioId, { premises }, '2026-09-19T12:20:00Z');
    subject.controller.edit(edited);
    const runPreview = vi.fn(async (input: PreviaRequest) => matchingEnvelope(input, envelopeFixture.execution_id));

    await executeStudyScenario({ ...subject, scenarioId: current.baseScenarioId, runPreview });

    expect(subject.repository.saves.slice(0, 2).map((save) => save.expectedRevision)).toEqual([1, 2]);
    expect(runPreview.mock.calls[0]![0].cenario.custo.iof_out).toBe('0.04');
  });

  it('faz flush, reserva por CAS e envia um único POST mesmo com duplo clique', async () => {
    const subject = await setup();
    const response = deferred<PreviewEnvelope>();
    let sent!: PreviaRequest;
    let executionId!: string;
    const statuses: string[] = [];
    const runPreview = vi.fn((input: PreviaRequest) => {
      sent = input; executionId = envelopeFixture.execution_id; return response.promise;
    });
    const options = {
      ...subject,
      scenarioId: subject.study.baseScenarioId,
      runPreview,
      onStatus: (attempt: { status: string }) => statuses.push(attempt.status),
    };

    const first = executeStudyScenario(options);
    const second = executeStudyScenario(options);
    await vi.waitFor(() => expect(runPreview).toHaveBeenCalledOnce());
    expect(subject.repository.saves[0]).toMatchObject({ expectedRevision: 1 });
    expect(subject.repository.saves[0]!.document.executions).toEqual([]);

    response.resolve(matchingEnvelope(sent, executionId));
    const [left, right] = await Promise.all([first, second]);
    expect(left.id).toBe(right.id);
    expect(runPreview).toHaveBeenCalledOnce();
    expect(subject.repository.document?.executions).toHaveLength(1);
    expect(subject.repository.document?.executions[0]).toMatchObject({ id: left.id, status: 'SUCCEEDED' });
    expect(statuses).toEqual(['PREPARING', 'RUNNING', 'SUCCEEDED']);
  });

  it('registra FAILED sem retry automático e preserva resultado anterior', async () => {
    const subject = await setup();
    const firstRun = vi.fn(async (input: PreviaRequest) => matchingEnvelope(input, envelopeFixture.execution_id));
    const succeeded = await executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId, runPreview: firstRun,
    });
    const failure = new ApiError({ status: 503, code: 'INDISPONIVEL', message: 'falhou' });
    const failingRun = vi.fn(async () => { throw failure; });

    const failed = await executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId, runPreview: failingRun,
    });

    expect(failingRun).toHaveBeenCalledOnce();
    expect(failed).toMatchObject({ status: 'FAILED', error: failure });
    expect(failed.id).not.toBe(succeeded.id);
    expect(subject.repository.document?.executions.map((item) => item.status)).toEqual(['SUCCEEDED', 'FAILED']);
    expect(succeeded.envelope).not.toBeNull();
  });

  it('rejeita envelope divergente e o registra como falha da tentativa', async () => {
    const subject = await setup();
    const runPreview = vi.fn(async (input: PreviaRequest) => ({
      ...matchingEnvelope(input, envelopeFixture.execution_id),
      scenario_revision: 99,
    }));

    const result = await executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId, runPreview,
    });

    expect(result).toMatchObject({ status: 'FAILED', envelope: null });
    expect(result.error).toBeInstanceOf(Error);
    expect(runPreview).toHaveBeenCalledOnce();
    expect(subject.repository.document?.executions.at(-1)?.status).toBe('FAILED');
  });

  it('mantém resposta atrasada no histórico como desatualizada após edição analítica', async () => {
    const subject = await setup();
    const response = deferred<PreviewEnvelope>();
    let sent!: PreviaRequest;
    let executionId!: string;
    const executing = executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId,
      runPreview: vi.fn((input) => { sent = input; executionId = envelopeFixture.execution_id; return response.promise; }),
    });
    await vi.waitFor(() => expect(subject.repository.saves).toHaveLength(1));
    const reserved = subject.controller.snapshot.document!;
    const costs = structuredClone(reserved.scenarios[0]!.premises) as DeepMutable<typeof reserved.scenarios[0]['premises']>;
    costs.costs.iof_out = '0.04';
    const edited = await updateScenario(reserved, reserved.baseScenarioId, { premises: costs }, '2026-09-19T12:20:00Z');
    subject.controller.edit(edited);
    await subject.controller.flush();

    response.resolve(matchingEnvelope(sent, executionId));
    const result = await executing;

    expect(result).toMatchObject({ status: 'SUCCEEDED', current: false });
    expect(subject.repository.document?.executions.at(-1)?.inputFingerprint)
      .not.toBe(subject.repository.document?.scenarios[0]?.inputFingerprint);
  });

  it('trata renomeação do cenário durante POST como atual porque o fingerprint não mudou', async () => {
    const subject = await setup();
    const response = deferred<PreviewEnvelope>();
    let sent!: PreviaRequest;
    let executionId!: string;
    const executing = executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId,
      runPreview: vi.fn((input) => { sent = input; executionId = envelopeFixture.execution_id; return response.promise; }),
    });
    await vi.waitFor(() => expect(subject.repository.saves).toHaveLength(1));
    const reserved = subject.controller.snapshot.document!;
    const renamed = await updateScenario(
      reserved,
      reserved.baseScenarioId,
      { name: 'Novo nome' },
      '2026-09-19T12:20:00Z',
    );
    expect(renamed.scenarios[0]!.revision).toBe(reserved.scenarios[0]!.revision + 1);
    expect(renamed.scenarios[0]!.inputFingerprint).toBe(reserved.scenarios[0]!.inputFingerprint);
    subject.controller.edit(renamed);
    await subject.controller.flush();
    response.resolve(matchingEnvelope(sent, executionId));

    await expect(executing).resolves.toMatchObject({ status: 'SUCCEEDED', current: true });
  });

  it('interrompe aplicação após troca de conta e não anexa retorno tardio', async () => {
    const subject = await setup();
    const response = deferred<PreviewEnvelope>();
    let sent!: PreviaRequest;
    let executionId!: string;
    const executing = executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId,
      runPreview: vi.fn((input) => { sent = input; executionId = envelopeFixture.execution_id; return response.promise; }),
    });
    await vi.waitFor(() => expect(subject.repository.saves).toHaveLength(1));
    await subject.controller.switchSession(null);
    response.resolve(matchingEnvelope(sent, executionId));

    await expect(executing).resolves.toMatchObject({ status: 'INTERRUPTED', current: false });
    expect(subject.repository.document?.executions).toEqual([]);
  });

  it('mantém sucesso em memória quando falha ao salvar a resposta', async () => {
    const subject = await setup();
    subject.repository.failOnSave = 2;

    const result = await executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId,
      runPreview: async (input) => matchingEnvelope(input, envelopeFixture.execution_id),
    });

    expect(result).toMatchObject({ status: 'SUCCEEDED', current: true });
    expect(result.envelope).not.toBeNull();
    expect(result.persistenceError).toBeInstanceOf(Error);
    expect(subject.controller.snapshot.status).toBe('STORAGE_FAILURE');
    expect(subject.controller.snapshot.document?.executions).toHaveLength(1);
  });
});
