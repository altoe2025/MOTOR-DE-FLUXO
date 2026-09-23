import type { ApiClient, DiagnosticEnvelope, DiagnosticRequest, JobSnapshot } from '../api/client';
import { assertImportExecutionAvailable } from '../importer/executionGate';
import { validateDiagnosticEnvelope } from '../api/validators';
import { ApiError } from '../api/errors';
import type { DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { appendDiagnosticExecution } from './domain';

export type DiagnosticStudyAuthority = {
  readonly snapshot: Readonly<{
    ownerSub: string | null;
    sessionEpoch: number;
    document: StudyDocument | null;
  }>;
  flush(): Promise<StudyDocument | null>;
  edit(document: StudyDocument): void;
  saveDetachedStudy(document: StudyDocument, expectedRevision: number): Promise<StudyDocument | null>;
  runForCurrentSession<T>(work: (session: Readonly<{
    ownerSub: string;
    epoch: number;
    signal: AbortSignal;
  }>) => Promise<T>): Promise<T | null>;
};

export type DiagnosticExecutionApi = Readonly<{
  getImportCatalog?: ApiClient['getImportCatalog'];
  submitDiagnostic(input: DiagnosticRequest, signal?: AbortSignal): Promise<JobSnapshot>;
  getDiagnosticJob(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
  getDiagnosticResult(jobId: string, signal?: AbortSignal): Promise<DiagnosticEnvelope>;
}>;

type DiagnosticCancellationApi = Pick<DiagnosticExecutionApi, 'getDiagnosticJob' | 'getDiagnosticResult'> & Readonly<{
  cancelDiagnostic(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
}>;

type DiagnosticRetryApi = Pick<DiagnosticExecutionApi, 'getDiagnosticJob' | 'getDiagnosticResult' | 'getImportCatalog'> & Readonly<{
  retryDiagnostic(jobId: string, idempotencyKey: string, signal?: AbortSignal): Promise<JobSnapshot>;
}>;

export type ExecuteStudyDiagnosticOptions = Readonly<{
  authority: DiagnosticStudyAuthority;
  scenarioId: string;
  buildRequest(context: Readonly<{
    study: StudyDocument;
    scenario: StudyDocument['scenarios'][number];
    attemptId: string;
  }>): Promise<DiagnosticRequest>;
  api: DiagnosticExecutionApi;
  nextId?: () => string;
  now?: () => string;
  waitForNextPoll?: (signal: AbortSignal) => Promise<void>;
}>;

export type DiagnosticExecutionAttempt = Readonly<{
  attemptId: string;
  jobId: string | null;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  envelope: DiagnosticEnvelope | null;
  error: Readonly<{ code: string; message: string }> | null;
  current: boolean;
}>;

type ResumeOptions = Readonly<{
  authority: DiagnosticStudyAuthority;
  scenarioId: string;
  nextId?: () => string;
  now?: () => string;
  waitForNextPoll?: (signal: AbortSignal) => Promise<void>;
}>;

export async function executeStudyDiagnostic(
  options: ExecuteStudyDiagnosticOptions,
): Promise<DiagnosticExecutionAttempt> {
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  const waitForNextPoll = options.waitForNextPoll ?? ((signal) => new Promise<void>((resolve) => {
    const handle = globalThis.setTimeout(resolve, 500);
    signal.addEventListener('abort', () => {
      globalThis.clearTimeout(handle);
      resolve();
    }, { once: true });
  }));
  let fallbackAttemptId: string | null = null;
  const result = await options.authority.runForCurrentSession(async ({ ownerSub, epoch, signal }) => {
    await options.authority.flush();
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    const study = options.authority.snapshot.document;
    if (study === null) throw new Error('Nenhum estudo selecionado para diagnóstico.');
    const scenario = study.scenarios.find((item) => item.id === options.scenarioId);
    if (scenario === undefined) throw new Error('Cenário não encontrado para diagnóstico.');

    let reservation = activeReservation(study, options.scenarioId);
    let reservedStudy = study;
    if (reservation === null) {
      await assertImportExecutionAvailable(scenario.sourceSnapshot, options.api.getImportCatalog, signal);
      if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
      fallbackAttemptId = nextId();
      const request = await options.buildRequest({
        study,
        scenario,
        attemptId: fallbackAttemptId,
      });
      if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
      assertRequestIdentity(request, study, scenario);
      const createdAt = now();
      reservation = {
        kind: 'DIAGNOSTIC',
        id: nextId(),
        attemptId: fallbackAttemptId,
        scenarioId: scenario.id,
        scenarioRevision: scenario.revision,
        inputFingerprint: scenario.inputFingerprint,
        requestSnapshot: structuredClone(request),
        sourceSnapshot: structuredClone(scenario.sourceSnapshot),
        premisesSnapshot: structuredClone(scenario.premises),
        periodSnapshot: structuredClone(scenario.period),
        status: 'QUEUED',
        jobId: request.idempotency_key,
        envelope: null,
        error: null,
        createdAt,
        finishedAt: null,
      };
      const withReservation = await appendDiagnosticExecution(study, reservation, createdAt);
      if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
        return interrupted(reservation, null);
      }
      options.authority.edit(withReservation);
      const stored = await options.authority.flush();
      if (stored === null || !sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
        return interrupted(reservation, null);
      }
      reservedStudy = stored;
      const submitted = await options.api.submitDiagnostic(request, signal);
      if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
        return interrupted(reservation, null);
      }
      assertJobIdentity(submitted, reservation);
    }

    let terminalSnapshot: JobSnapshot;
    try {
      for (;;) {
        terminalSnapshot = await options.api.getDiagnosticJob(reservation.jobId!, signal);
        if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
          return interrupted(reservation, null);
        }
        assertJobIdentity(terminalSnapshot, reservation);
        if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(terminalSnapshot.status)) break;
        await waitForNextPoll(signal);
        if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
          return interrupted(reservation, null);
        }
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      return persistTerminal(
        options.authority, ownerSub, epoch, reservedStudy, reservation,
        terminalRecord(reservation, nextId(), 'INTERRUPTED', now(), null, {
          code: 'SERVER_RESTART_OR_JOB_EXPIRED',
          message: 'O job não está mais disponível no servidor.',
        }),
        signal,
      );
    }

    let envelope: DiagnosticEnvelope | null = null;
    if (terminalSnapshot.status === 'SUCCEEDED') {
      try {
        envelope = await options.api.getDiagnosticResult(reservation.jobId!, signal);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        return persistTerminal(
          options.authority, ownerSub, epoch, reservedStudy, reservation,
          terminalRecord(reservation, nextId(), 'INTERRUPTED', now(), null, {
            code: 'SERVER_RESTART_OR_JOB_EXPIRED',
            message: 'O resultado do job não está mais disponível no servidor.',
          }),
          signal,
        );
      }
      if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
        return interrupted(reservation, null);
      }
      assertEnvelopeIdentity(envelope, reservation);
    }
    const status = terminalSnapshot.status as 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    const error = status === 'FAILED'
      ? {
          code: terminalSnapshot.error?.code ?? 'DIAGNOSTICO_INVALIDO',
          message: terminalSnapshot.error?.message ?? 'O diagnóstico falhou.',
        }
      : status === 'CANCELLED'
        ? { code: 'CANCELLED', message: 'O diagnóstico foi cancelado.' }
        : null;
    return persistTerminal(
      options.authority,
      ownerSub,
      epoch,
      reservedStudy,
      reservation,
      terminalRecord(reservation, nextId(), status, now(), envelope, error),
      signal,
    );
  });
  return result ?? {
    attemptId: fallbackAttemptId ?? '',
    jobId: null,
    status: 'INTERRUPTED',
    envelope: null,
    error: null,
    current: false,
  };
}

export async function cancelStudyDiagnostic(
  options: ResumeOptions & Readonly<{ api: DiagnosticCancellationApi }>,
): Promise<DiagnosticExecutionAttempt> {
  const cancelled = await options.authority.runForCurrentSession(async ({ ownerSub, epoch, signal }) => {
    await options.authority.flush();
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    const study = options.authority.snapshot.document;
    if (study === null) throw new Error('Nenhum estudo selecionado para cancelamento.');
    const reservation = activeReservation(study, options.scenarioId);
    if (reservation === null || reservation.jobId === null) {
      throw new Error('Nenhum diagnóstico ativo para cancelamento.');
    }
    const snapshot = await options.api.cancelDiagnostic(reservation.jobId, signal);
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    assertJobIdentity(snapshot, reservation);
    return reservation;
  });
  if (cancelled === null) {
    return { attemptId: '', jobId: null, status: 'INTERRUPTED', envelope: null, error: null, current: false };
  }
  return executeStudyDiagnostic({
    ...options,
    api: {
      submitDiagnostic: async () => { throw new Error('Reserva existente não pode reenviar POST.'); },
      getDiagnosticJob: options.api.getDiagnosticJob,
      getDiagnosticResult: options.api.getDiagnosticResult,
    },
    buildRequest: async () => { throw new Error('Reserva existente não pode reconstruir request.'); },
  });
}

export async function retryStudyDiagnostic(
  options: Omit<ResumeOptions, 'scenarioId'> & Readonly<{
    executionId: string;
    idempotencyKey: string;
    api: DiagnosticRetryApi;
  }>,
): Promise<DiagnosticExecutionAttempt> {
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  const reserved = await options.authority.runForCurrentSession(async ({ ownerSub, epoch, signal }) => {
    await options.authority.flush();
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    const study = options.authority.snapshot.document;
    if (study === null) throw new Error('Nenhum estudo selecionado para retry.');
    const original = study.executions.find((item): item is DiagnosticExecutionRecord =>
      item.kind === 'DIAGNOSTIC' && item.id === options.executionId);
    if (original === undefined || !['FAILED', 'CANCELLED'].includes(original.status)
      || original.jobId === null) {
      throw new Error('Execução diagnóstica não pode ser repetida.');
    }
    await assertImportExecutionAvailable(original.sourceSnapshot, options.api.getImportCatalog, signal);
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    const attemptId = nextId();
    const request = {
      ...structuredClone(original.requestSnapshot),
      idempotency_key: options.idempotencyKey,
    };
    const reservation: DiagnosticExecutionRecord = {
      ...structuredClone(original),
      id: nextId(),
      attemptId,
      requestSnapshot: request,
      status: 'QUEUED',
      jobId: options.idempotencyKey,
      envelope: null,
      error: null,
      createdAt: now(),
      finishedAt: null,
    };
    const withReservation = await appendDiagnosticExecution(study, reservation, reservation.createdAt);
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    options.authority.edit(withReservation);
    const stored = await options.authority.flush();
    if (stored === null || !sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    const snapshot = await options.api.retryDiagnostic(original.jobId, options.idempotencyKey, signal);
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    assertJobIdentity(snapshot, reservation);
    return reservation;
  });
  if (reserved === null) {
    return { attemptId: '', jobId: null, status: 'INTERRUPTED', envelope: null, error: null, current: false };
  }
  return executeStudyDiagnostic({
    ...options,
    scenarioId: reserved.scenarioId,
    api: {
      submitDiagnostic: async () => { throw new Error('Retry reservado não pode reenviar POST.'); },
      ...(options.api.getImportCatalog === undefined ? {} : { getImportCatalog: options.api.getImportCatalog }),
      getDiagnosticJob: options.api.getDiagnosticJob,
      getDiagnosticResult: options.api.getDiagnosticResult,
    },
    buildRequest: async () => { throw new Error('Retry reservado não pode reconstruir request.'); },
    nextId,
  });
}

function activeReservation(study: StudyDocument, scenarioId: string): DiagnosticExecutionRecord | null {
  const terminalAttempts = new Set(study.executions
    .filter((item) => item.kind === 'DIAGNOSTIC'
      && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(item.status))
    .map((item) => item.kind === 'DIAGNOSTIC' ? item.attemptId : ''));
  return study.executions.find((item): item is DiagnosticExecutionRecord =>
    item.kind === 'DIAGNOSTIC'
    && item.scenarioId === scenarioId
    && item.status === 'QUEUED'
    && !terminalAttempts.has(item.attemptId)) ?? null;
}

function assertRequestIdentity(
  request: DiagnosticRequest,
  study: StudyDocument,
  scenario: StudyDocument['scenarios'][number],
): void {
  if (request.study_id !== study.id
    || request.scenario_id !== scenario.id
    || request.scenario_revision !== scenario.revision
    || request.input_fingerprint !== scenario.inputFingerprint
    || request.idempotency_key.length === 0) {
    throw new Error('Request diagnóstico diverge do snapshot reservado.');
  }
}

function assertJobIdentity(snapshot: JobSnapshot, reservation: DiagnosticExecutionRecord): void {
  if (snapshot.job_id !== reservation.jobId
    || snapshot.request_id !== reservation.requestSnapshot.request_id) {
    throw new Error('Job diagnóstico diverge da reserva persistida.');
  }
}

function assertEnvelopeIdentity(
  envelope: DiagnosticEnvelope,
  reservation: DiagnosticExecutionRecord,
): void {
  const request = reservation.requestSnapshot;
  const selected = envelope.selected_execution;
  if (!validateDiagnosticEnvelope(envelope)
    || envelope.job_id !== reservation.jobId
    || envelope.request_fingerprint !== request.input_fingerprint
    || selected.study_id !== request.study_id
    || selected.scenario_id !== request.scenario_id
    || selected.scenario_revision !== request.scenario_revision) {
    throw new Error('Envelope diagnóstico diverge da tentativa reservada.');
  }
}

function terminalRecord(
  reservation: DiagnosticExecutionRecord,
  id: string,
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED',
  finishedAt: string,
  envelope: DiagnosticEnvelope | null,
  error: Readonly<{ code: string; message: string }> | null,
): DiagnosticExecutionRecord {
  return {
    ...structuredClone(reservation),
    id,
    status,
    envelope: envelope === null ? null : structuredClone(envelope),
    error,
    finishedAt,
  };
}

function interrupted(
  reservation: DiagnosticExecutionRecord,
  error: Readonly<{ code: string; message: string }> | null,
): DiagnosticExecutionAttempt {
  return {
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    status: 'INTERRUPTED',
    envelope: null,
    error,
    current: false,
  };
}

function sessionIsCurrent(
  authority: DiagnosticStudyAuthority,
  ownerSub: string,
  epoch: number,
  signal: AbortSignal,
): boolean {
  return !signal.aborted
    && authority.snapshot.ownerSub === ownerSub
    && authority.snapshot.sessionEpoch === epoch;
}

async function persistTerminal(
  authority: DiagnosticStudyAuthority,
  ownerSub: string,
  epoch: number,
  reservedStudy: StudyDocument,
  reservation: DiagnosticExecutionRecord,
  terminal: DiagnosticExecutionRecord,
  signal: AbortSignal,
): Promise<DiagnosticExecutionAttempt> {
  if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
    return interrupted(reservation, terminal.error);
  }
  await authority.flush();
  if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
    return interrupted(reservation, terminal.error);
  }
  const currentStudy = authority.snapshot.document;
  const current = currentStudy?.scenarios.find((item) => item.id === reservation.scenarioId)
    ?.inputFingerprint === reservation.inputFingerprint;
  if (currentStudy?.id === reservation.requestSnapshot.study_id) {
    if (!currentStudy.executions.some((item) => item.kind === 'DIAGNOSTIC'
      && item.attemptId === reservation.attemptId
      && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(item.status))) {
      const completed = await appendDiagnosticExecution(currentStudy, terminal, terminal.finishedAt!);
      if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
        return interrupted(reservation, terminal.error);
      }
      authority.edit(completed);
      await authority.flush();
      if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
        return interrupted(reservation, terminal.error);
      }
    }
  } else {
    const detached = await appendDiagnosticExecution(reservedStudy, terminal, terminal.finishedAt!);
    if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
      return interrupted(reservation, terminal.error);
    }
    await authority.saveDetachedStudy(detached, reservedStudy.revision);
    if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
      return interrupted(reservation, terminal.error);
    }
  }
  return {
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    status: terminal.status as DiagnosticExecutionAttempt['status'],
    envelope: terminal.envelope === null
      ? null
      : structuredClone(terminal.envelope) as DiagnosticEnvelope,
    error: terminal.error,
    current: current === true,
  };
}
