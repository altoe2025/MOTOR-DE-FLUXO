import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { PreviaRequest, PreviewEnvelope } from '../api/client';
import { ApiError } from '../api/errors';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import type { OperationalProfileVersion } from '../profiles/domain';
import { buildPreviewRequest, type PreviewRequestProvenance } from '../preparation/buildPreviewRequest';
import type {
  ApplicationRepository,
  AppendProfileVersionMutation,
  CASMutation,
  ConfirmObservedCaseMutation,
} from '../storage/applicationRepository';
import { createStudy, updateScenario } from './domain';
import {
  FIXTURE_NOW,
  FIXTURE_OWNER,
  makeObservedSnapshot,
  makeScenarioDraft,
  makeSyntheticSnapshot,
} from './fixtures';
import type { DeepMutable, StudyDocument } from './model';
import { StudyController } from './studyController';
import { executeStudyScenario, ExecutionInProgressError } from './executionService';

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
  readonly additionalDocuments = new Map<string, StudyDocument>();
  readonly saves: CASMutation<StudyDocument>[] = [];
  failOnSave = 0;
  saveStudyImplementation: ((input: CASMutation<StudyDocument>) => Promise<StudyDocument>) | null = null;
  constructor(document: StudyDocument) { this.document = document; }
  async listCompanies(): Promise<CompanyRecord[]> { return []; }
  async listObservedCases(): Promise<ObservedCase[]> { return []; }
  async getObservedCase(): Promise<ObservedCase | null> { return null; }
  async confirmObservedCase(input: ConfirmObservedCaseMutation): Promise<ObservedCase> { return input.observedCase; }
  async listOperationalProfileVersions(): Promise<OperationalProfileVersion[]> { return []; }
  async getOperationalProfileVersion(): Promise<OperationalProfileVersion | null> { return null; }
  async appendOperationalProfileVersion(input: AppendProfileVersionMutation): Promise<OperationalProfileVersion> {
    return input.document;
  }
  async listStudies(): Promise<StudyDocument[]> {
    return [...(this.document === null ? [] : [this.document]), ...this.additionalDocuments.values()];
  }
  async getStudy(id: string): Promise<StudyDocument | null> {
    return this.document?.id === id ? this.document : this.additionalDocuments.get(id) ?? null;
  }
  async saveStudy(input: CASMutation<StudyDocument>): Promise<StudyDocument> {
    this.saves.push(input);
    if (this.failOnSave === this.saves.length) throw new Error('quota');
    if (this.saveStudyImplementation !== null) return this.saveStudyImplementation(input);
    const current = await this.getStudy(input.document.id);
    if (current?.revision !== input.expectedRevision) throw new Error('CAS');
    if (this.document?.id === input.document.id) this.document = input.document;
    else this.additionalDocuments.set(input.document.id, input.document);
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

function secondController(repository: MemoryRepository): StudyController {
  let operation = 100;
  return new StudyController({
    repositoryFactory: () => repository,
    channelFactory: () => ({
      postMessage() {}, addEventListener() {}, removeEventListener() {}, close() {},
    }),
    operationId: () => `operation-${++operation}`,
    autosaveDelayMs: 60_000,
  });
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
    expect(subject.repository.saves[0]!.document.executions).toHaveLength(1);
    expect(subject.repository.saves[0]!.document.executions[0]).toMatchObject({
      status: 'RUNNING',
      requestSnapshot: { request_id: sent.request_id },
    });

    response.resolve(matchingEnvelope(sent, executionId));
    const [left, right] = await Promise.all([first, second]);
    expect(left.id).toBe(right.id);
    expect(runPreview).toHaveBeenCalledOnce();
    expect(subject.repository.document?.executions.map((item) => item.status)).toEqual(['RUNNING', 'SUCCEEDED']);
    expect(subject.repository.document?.executions[0]).toMatchObject({ id: left.id, attemptId: left.id });
    expect(subject.repository.document?.executions[1]).toMatchObject({ attemptId: left.id, status: 'SUCCEEDED' });
    expect(statuses).toEqual(['PREPARING', 'RUNNING', 'SUCCEEDED']);
  });

  it('recusa em outra aba a reserva durável já commitada e mantém um único POST', async () => {
    const subject = await setup();
    const response = deferred<PreviewEnvelope>();
    let sent!: PreviaRequest;
    const firstPost = vi.fn((input: PreviaRequest) => {
      sent = input;
      return response.promise;
    });
    const first = executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId, runPreview: firstPost,
    });
    await vi.waitFor(() => expect(subject.repository.document?.executions[0]?.status).toBe('RUNNING'));

    const other = secondController(subject.repository);
    await other.switchSession(FIXTURE_OWNER);
    await other.loadStudy(subject.study.id);
    const secondPost = vi.fn(async (input: PreviaRequest) => matchingEnvelope(input, envelopeFixture.execution_id));
    const refused = await executeStudyScenario({
      controller: other,
      scenarioId: subject.study.baseScenarioId,
      buildRequest: subject.buildRequest,
      runPreview: secondPost,
      nextId: subject.nextId,
      now: subject.now,
    });

    expect(refused).toMatchObject({ status: 'INTERRUPTED', current: false });
    expect(refused.error).toBeInstanceOf(ExecutionInProgressError);
    expect(secondPost).not.toHaveBeenCalled();
    response.resolve(matchingEnvelope(sent, envelopeFixture.execution_id));
    await expect(first).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(firstPost).toHaveBeenCalledOnce();
  });

  it('finaliza reserva cancelada após o commit e permite nova execução sem POST antigo', async () => {
    const subject = await setup();
    const reservationCommit = deferred<void>();
    let firstSave = true;
    subject.repository.saveStudyImplementation = async (input) => {
      if (firstSave) {
        firstSave = false;
        await reservationCommit.promise;
      }
      if (subject.repository.document?.revision !== input.expectedRevision) throw new Error('CAS');
      subject.repository.document = input.document;
      return input.document;
    };
    const cancelledPost = vi.fn();
    const cancelled = executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId, runPreview: cancelledPost,
    });
    await vi.waitFor(() => expect(subject.repository.saves).toHaveLength(1));
    const reservation = subject.repository.saves[0]!.document.executions[0]!;

    await subject.controller.loadStudy(subject.study.id);
    reservationCommit.resolve();
    await expect(cancelled).resolves.toMatchObject({ status: 'INTERRUPTED' });

    expect(cancelledPost).not.toHaveBeenCalled();
    expect(subject.repository.document?.executions).toHaveLength(2);
    expect(subject.repository.document?.executions[1]).toMatchObject({
      status: 'INTERRUPTED', finishedAt: expect.any(String),
      requestSnapshot: { request_id: reservation.requestSnapshot.request_id },
    });
    const completedRequest = subject.repository.document?.executions[1]?.requestSnapshot.request_id;

    await subject.controller.loadStudy(subject.study.id);
    const nextPost = vi.fn(async (input: PreviaRequest) => matchingEnvelope(input, envelopeFixture.execution_id));
    await expect(executeStudyScenario({
      ...subject, scenarioId: subject.study.baseScenarioId, runPreview: nextPost,
    })).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(nextPost).toHaveBeenCalledOnce();
    expect(subject.repository.document?.executions.at(-1)?.requestSnapshot.request_id)
      .not.toBe(completedRequest);
  });

  it('mantém reserva abandonada bloqueante após perda de epoch e não duplica POST', async () => {
    const subject = await setup();
    const reservationCommit = deferred<void>();
    subject.repository.saveStudyImplementation = async (input) => {
      await reservationCommit.promise;
      if (subject.repository.document?.revision !== input.expectedRevision) throw new Error('CAS');
      subject.repository.document = input.document;
      return input.document;
    };
    const abandonedPost = vi.fn();
    const abandoned = executeStudyScenario({
      ...subject,
      scenarioId: subject.study.baseScenarioId,
      runPreview: abandonedPost,
      reservationLeaseMs: 600_000,
    });
    await vi.waitFor(() => expect(subject.repository.saves).toHaveLength(1));
    await subject.controller.switchSession(null);
    reservationCommit.resolve();

    await expect(abandoned).resolves.toMatchObject({ status: 'INTERRUPTED' });
    expect(abandonedPost).not.toHaveBeenCalled();
    expect(subject.repository.document?.executions[0]?.status).toBe('RUNNING');

    await subject.controller.switchSession(FIXTURE_OWNER);
    await subject.controller.loadStudy(subject.study.id);
    const duplicatePost = vi.fn();
    const refused = await executeStudyScenario({
      ...subject,
      scenarioId: subject.study.baseScenarioId,
      runPreview: duplicatePost,
      reservationLeaseMs: 600_000,
    });
    expect(refused.error).toBeInstanceOf(ExecutionInProgressError);
    expect(duplicatePost).not.toHaveBeenCalled();

    const resumedPost = vi.fn(async (input: PreviaRequest) => matchingEnvelope(input, envelopeFixture.execution_id));
    await expect(executeStudyScenario({
      ...subject,
      scenarioId: subject.study.baseScenarioId,
      runPreview: resumedPost,
      now: () => '2026-09-19T13:00:00Z',
      reservationLeaseMs: 1,
    })).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(resumedPost).toHaveBeenCalledOnce();
    expect(subject.repository.document?.executions
      .filter((execution) => execution.status !== 'RUNNING')
      .map((execution) => execution.status))
      .toEqual(['INTERRUPTED', 'SUCCEEDED']);
  });

  it('converte falha do flush inicial em FAILED sem POST e preserva STORAGE_FAILURE', async () => {
    const subject = await setup();
    const current = subject.controller.snapshot.document!;
    const edited = await updateScenario(current, current.baseScenarioId, { name: 'Pendente' }, '2026-09-19T12:20:00Z');
    subject.controller.edit(edited);
    subject.repository.failOnSave = 1;
    const runPreview = vi.fn();
    const statuses: string[] = [];

    const result = await executeStudyScenario({
      ...subject,
      scenarioId: current.baseScenarioId,
      runPreview,
      onStatus: (value) => statuses.push(value.status),
    });

    expect(result).toMatchObject({ status: 'FAILED', request: null });
    expect(result.persistenceError).toBeInstanceOf(Error);
    expect(subject.controller.snapshot).toMatchObject({ status: 'STORAGE_FAILURE', document: edited });
    expect(runPreview).not.toHaveBeenCalled();
    expect(statuses).toEqual(['PREPARING', 'FAILED']);
  });

  it('converte falha ao persistir reserva em FAILED sem POST e mantém a reserva em memória', async () => {
    const subject = await setup();
    subject.repository.failOnSave = 1;
    const runPreview = vi.fn();
    const statuses: string[] = [];

    const result = await executeStudyScenario({
      ...subject,
      scenarioId: subject.study.baseScenarioId,
      runPreview,
      onStatus: (value) => statuses.push(value.status),
    });

    expect(result).toMatchObject({ status: 'FAILED' });
    expect(result.request).not.toBeNull();
    expect(result.persistenceError).toBeInstanceOf(Error);
    expect(subject.controller.snapshot.status).toBe('STORAGE_FAILURE');
    expect(subject.controller.snapshot.document?.executions[0]?.status).toBe('RUNNING');
    expect(subject.repository.document?.executions).toEqual([]);
    expect(runPreview).not.toHaveBeenCalled();
    expect(statuses).toEqual(['PREPARING', 'FAILED']);
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
    expect(subject.repository.document?.executions
      .filter((item) => item.status !== 'RUNNING')
      .map((item) => item.status))
      .toEqual(['SUCCEEDED', 'FAILED']);
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

  it('preserva o snapshot analítico observado e a comparação usados após o cenário mudar', async () => {
    const subject = await setup();
    const initial = subject.controller.snapshot.document!;
    const observed = await updateScenario(
      initial,
      initial.baseScenarioId,
      { sourceSnapshot: makeObservedSnapshot() },
      '2026-09-19T12:20:00Z',
    );
    subject.controller.edit(observed);
    await subject.controller.flush();

    await executeStudyScenario({
      ...subject,
      scenarioId: initial.baseScenarioId,
      runPreview: async (input) => matchingEnvelope(input, envelopeFixture.execution_id),
    });

    const afterExecution = subject.controller.snapshot.document!;
    const succeeded = afterExecution.executions.at(-1)!;
    if (succeeded.kind !== 'PREVIEW') throw new Error('execução preview esperada');
    const changed = await updateScenario(
      afterExecution,
      afterExecution.baseScenarioId,
      { sourceSnapshot: makeSyntheticSnapshot() },
      '2026-09-19T12:30:00Z',
    );

    expect(succeeded.sourceSnapshot).toMatchObject({
      source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 4 },
      observedOutcome: { schemaVersion: '1.0.0' },
    });
    expect(succeeded.premisesSnapshot).toEqual(observed.scenarios[0]!.premises);
    expect(succeeded.periodSnapshot).toEqual(observed.scenarios[0]!.period);
    expect(succeeded.observedComparison?.rows[0]).toMatchObject({ code: 'GROSS_OUT_BRL' });
    expect(changed.scenarios[0]!.sourceSnapshot.source.kind).toBe('SYNTHETIC');
    expect(succeeded.sourceSnapshot?.source.kind).toBe('OBSERVED_CASE');
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
    expect(subject.repository.document?.executions.map((item) => item.status)).toEqual(['RUNNING']);
  });

  it('persiste o terminal de A por CAS sem trocar a seleção B e reabre A sem reserva RUNNING', async () => {
    const subject = await setup();
    const studyB = await createStudy({
      id: '00000000-0000-4000-8000-000000000099', ownerSub: FIXTURE_OWNER,
      name: 'Estudo B', baseScenario: makeScenarioDraft({ id: 'scenario-b' }), now: FIXTURE_NOW,
    });
    subject.repository.additionalDocuments.set(studyB.id, studyB);
    const response = deferred<PreviewEnvelope>();
    let sent!: PreviaRequest;
    const executing = executeStudyScenario({
      ...subject,
      scenarioId: subject.study.baseScenarioId,
      runPreview: vi.fn((input) => { sent = input; return response.promise; }),
    });
    await vi.waitFor(() => expect(subject.repository.document?.executions[0]?.status).toBe('RUNNING'));

    await subject.controller.loadStudy(studyB.id);
    response.resolve(matchingEnvelope(sent, envelopeFixture.execution_id));
    await expect(executing).resolves.toMatchObject({ status: 'SUCCEEDED', current: false });

    expect(subject.controller.snapshot.document?.id).toBe(studyB.id);
    const reopenedA = await subject.controller.loadStudy(subject.study.id);
    expect(reopenedA?.executions
      .filter((execution) => execution.status !== 'RUNNING')
      .map((execution) => execution.status))
      .toEqual(['SUCCEEDED']);
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
    expect(subject.controller.snapshot.document?.executions).toHaveLength(2);
    expect(subject.controller.snapshot.document?.executions[1]?.status).toBe('SUCCEEDED');
  });
});
