import type { DiagnosticEnvelope, DiagnosticRequest, JobSnapshot } from '../api/client';
import { validateDiagnosticEnvelope } from '../api/validators';
import { ApiError } from '../api/errors';
import type { DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { appendDiagnosticAttemptAtomically, appendDiagnosticExecution } from './domain';

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
  submitDiagnostic(input: DiagnosticRequest, signal?: AbortSignal): Promise<JobSnapshot>;
  getDiagnosticJob(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
  getDiagnosticResult(jobId: string, signal?: AbortSignal): Promise<DiagnosticEnvelope>;
}>;

type DiagnosticCancellationApi = Pick<DiagnosticExecutionApi, 'getDiagnosticJob' | 'getDiagnosticResult'> & Readonly<{
  cancelDiagnostic(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
}>;

type DiagnosticRetryApi = Pick<DiagnosticExecutionApi, 'getDiagnosticJob' | 'getDiagnosticResult'>
  & Partial<Pick<DiagnosticExecutionApi, 'submitDiagnostic'>> & Readonly<{
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
  persistence?: 'RESERVATION_AND_TERMINAL' | 'TERMINAL_ONLY';
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

export type ComputedDiagnosticAttempt = Readonly<{
  reservation: DiagnosticExecutionRecord;
  terminal: DiagnosticExecutionRecord;
  attempt: DiagnosticExecutionAttempt;
}>;

export async function computeDiagnosticAttempt(
  options: Omit<ExecuteStudyDiagnosticOptions, 'authority' | 'persistence'> & Readonly<{
    study: StudyDocument;
    signal: AbortSignal;
  }>,
): Promise<ComputedDiagnosticAttempt> {
  const { study, signal } = options;
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  signal.throwIfAborted();
  const scenario = study.scenarios.find((item) => item.id === options.scenarioId);
  if (scenario === undefined) throw new Error('Cenário não encontrado para diagnóstico.');
  const attemptId = nextId();
  const request = await options.buildRequest({ study, scenario, attemptId });
  signal.throwIfAborted();
  assertRequestIdentity(request, study, scenario);
  const reservation = createReservation(scenario, request, attemptId, nextId(), now());
  assertDeferredReservation(study, reservation);
  const terminal = await computeTerminal(reservation, options.api, signal, () => !signal.aborted,
    nextId, now, options.waitForNextPoll ?? waitForPoll, true);
  signal.throwIfAborted();
  if (terminal === null) throw new DOMException('Diagnóstico interrompido.', 'AbortError');
  return { reservation, terminal, attempt: terminalAttempt(reservation, terminal, true) };
}

function createReservation(
  scenario: StudyDocument['scenarios'][number], request: DiagnosticRequest,
  attemptId: string, id: string, createdAt: string,
): DiagnosticExecutionRecord {
  return {
    kind: 'DIAGNOSTIC', id, attemptId, scenarioId: scenario.id,
    scenarioRevision: scenario.revision, inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: structuredClone(request), sourceSnapshot: structuredClone(scenario.sourceSnapshot),
    premisesSnapshot: structuredClone(scenario.premises), periodSnapshot: structuredClone(scenario.period),
    status: 'QUEUED', jobId: request.idempotency_key, envelope: null, error: null, createdAt, finishedAt: null,
  };
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { globalThis.clearTimeout(handle); signal.removeEventListener('abort', finish); resolve(); };
    const handle = globalThis.setTimeout(finish, 500);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** Shared remote protocol for new, persisted, cancelled and retried reservations. */
async function computeTerminal(
  reservation: DiagnosticExecutionRecord, api: DiagnosticExecutionApi, signal: AbortSignal,
  isCurrent: () => boolean, nextId: () => string, now: () => string,
  waitForNextPoll: (signal: AbortSignal) => Promise<void>, submit: boolean,
): Promise<DiagnosticExecutionRecord | null> {
  if (!isCurrent()) return null;
  if (submit) {
    let submitted: JobSnapshot;
    try {
      submitted = await api.submitDiagnostic(structuredClone(reservation.requestSnapshot) as DiagnosticRequest, signal);
    } catch (error) {
      if (!isCurrent()) return null;
      const failure = error instanceof ApiError ? { code: error.code, message: error.message }
        : { code: 'DIAGNOSTIC_SUBMISSION_FAILED', message: 'O servidor não recebeu o diagnóstico.' };
      return terminalRecord(reservation, nextId(), 'FAILED', now(), null, failure);
    }
    if (!isCurrent()) return null;
    assertJobIdentity(submitted, reservation);
  }
  let terminalSnapshot: JobSnapshot;
  try {
    for (;;) {
      terminalSnapshot = await api.getDiagnosticJob(reservation.jobId!, signal);
      if (!isCurrent()) return null;
      assertJobIdentity(terminalSnapshot, reservation);
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(terminalSnapshot.status)) break;
      await waitForNextPoll(signal);
      if (!isCurrent()) return null;
    }
  } catch (error) {
    if (!isCurrent()) return null;
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    return terminalRecord(reservation, nextId(), 'INTERRUPTED', now(), null, {
      code: 'SERVER_RESTART_OR_JOB_EXPIRED', message: 'O job não está mais disponível no servidor.',
    });
  }
  let envelope: DiagnosticEnvelope | null = null;
  if (terminalSnapshot.status === 'SUCCEEDED') {
    try {
      envelope = await api.getDiagnosticResult(reservation.jobId!, signal);
      assertEnvelopeIdentity(envelope, reservation);
    } catch (error) {
      if (!isCurrent()) return null;
      const expired = error instanceof ApiError && error.status === 404;
      if (!expired && !definitiveResultFailure(error)) throw error;
      return terminalRecord(reservation, nextId(), expired ? 'INTERRUPTED' : 'FAILED', now(), null, {
        code: expired ? 'SERVER_RESTART_OR_JOB_EXPIRED' : 'DIAGNOSTIC_RESULT_UNAVAILABLE',
        message: expired
          ? 'O resultado do job não está mais disponível no servidor.'
          : 'O resultado não pôde ser recuperado. Inicie um novo diagnóstico.',
      });
    }
    if (!isCurrent()) return null;
  }
  const status = terminalSnapshot.status as 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  const error = status === 'FAILED'
    ? { code: terminalSnapshot.error?.code ?? 'DIAGNOSTICO_INVALIDO', message: terminalSnapshot.error?.message ?? 'O diagnóstico falhou.' }
    : status === 'CANCELLED' ? { code: 'CANCELLED', message: 'O diagnóstico foi cancelado.' } : null;
  return terminalRecord(reservation, nextId(), status, now(), envelope, error);
}

export async function executeStudyDiagnostic(
  options: ExecuteStudyDiagnosticOptions,
): Promise<DiagnosticExecutionAttempt> {
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  const waitForNextPoll = options.waitForNextPoll ?? waitForPoll;
  let fallbackAttemptId: string | null = null;
  const result = await options.authority.runForCurrentSession(async ({ ownerSub, epoch, signal }) => {
    await options.authority.flush();
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    const study = options.authority.snapshot.document;
    if (study === null) throw new Error('Nenhum estudo selecionado para diagnóstico.');
    const scenario = study.scenarios.find((item) => item.id === options.scenarioId);
    if (scenario === undefined) throw new Error('Cenário não encontrado para diagnóstico.');

    let reservation = activeReservation(study, options.scenarioId);
    const needsSubmission = reservation === null;
    let reservedStudy = study;
    const reservationDeferred = options.persistence === 'TERMINAL_ONLY' && reservation === null;
    if (reservation === null) {
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
      reservation = createReservation(scenario, request, fallbackAttemptId, nextId(), createdAt);
      if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
        return interrupted(reservation, null);
      }
      if (reservationDeferred) {
        assertDeferredReservation(study, reservation);
        reservedStudy = study;
      } else {
        const withReservation = await appendDiagnosticExecution(study, reservation, createdAt);
        options.authority.edit(withReservation);
        const stored = await options.authority.flush();
        if (stored === null || !sessionIsCurrent(options.authority, ownerSub, epoch, signal)) {
          return interrupted(reservation, null);
        }
        reservedStudy = stored;
      }
    }
    let terminal: DiagnosticExecutionRecord | null;
    try {
      terminal = await computeTerminal(reservation, options.api, signal,
        () => sessionIsCurrent(options.authority, ownerSub, epoch, signal),
        nextId, now, waitForNextPoll, needsSubmission);
    } catch (error) {
      if (reservationDeferred) {
        await persistDeferredReservation(
          options.authority, ownerSub, epoch, reservedStudy, reservation, signal,
        );
      }
      throw error;
    }
    if (terminal === null) return interrupted(reservation, null);
    return persistTerminal(
      options.authority,
      ownerSub,
      epoch,
      reservedStudy,
      reservation,
      terminal,
      signal,
      reservationDeferred,
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
    const localResultFailure = original.error?.code === 'DIAGNOSTIC_RESULT_UNAVAILABLE';
    if (localResultFailure && options.api.submitDiagnostic === undefined) {
      throw new Error('Uma falha local de resultado exige iniciar uma nova tentativa.');
    }
    if (!sessionIsCurrent(options.authority, ownerSub, epoch, signal)) return null;
    const attemptId = nextId();
    const request = {
      ...structuredClone(original.requestSnapshot) as DiagnosticRequest,
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
    // The server succeeded; only the local download failed. Its retry endpoint
    // deliberately rejects SUCCEEDED jobs, so issue a fresh command with a new key.
    const snapshot = localResultFailure
      ? await options.api.submitDiagnostic!(request, signal)
      : await options.api.retryDiagnostic(original.jobId, options.idempotencyKey, signal);
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

function assertDeferredReservation(
  study: StudyDocument,
  reservation: DiagnosticExecutionRecord,
): void {
  const createdAt = new Date(reservation.createdAt);
  if (reservation.status !== 'QUEUED'
    || reservation.id.trim().length === 0
    || reservation.attemptId.trim().length === 0
    || reservation.jobId === null
    || reservation.jobId !== reservation.requestSnapshot.idempotency_key
    || reservation.finishedAt !== null
    || reservation.envelope !== null
    || reservation.error !== null
    || Number.isNaN(createdAt.valueOf())
    || !reservation.createdAt.endsWith('Z')) {
    throw new Error('Reserva diagnóstica local inválida.');
  }
  if (study.executions.some((existing) => existing.id === reservation.id
    || (existing.kind === 'DIAGNOSTIC' && existing.attemptId === reservation.attemptId))) {
    throw new Error('Reserva diagnóstica local colide com execução persistida.');
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
    throw new InvalidDiagnosticResultError('Envelope diagnóstico diverge da tentativa reservada.');
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
  reservationDeferred = false,
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
      const completed = reservationDeferred
        ? await appendDiagnosticAttemptAtomically(currentStudy, reservation, terminal)
        : await appendDiagnosticExecution(currentStudy, terminal, terminal.finishedAt!);
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
    const detached = reservationDeferred
      ? await appendDiagnosticAttemptAtomically(reservedStudy, reservation, terminal)
      : await appendDiagnosticExecution(reservedStudy, terminal, terminal.finishedAt!);
    if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
      return interrupted(reservation, terminal.error);
    }
    await authority.saveDetachedStudy(detached, reservedStudy.revision);
    if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) {
      return interrupted(reservation, terminal.error);
    }
  }
  return terminalAttempt(reservation, terminal, current === true);
}

function terminalAttempt(
  reservation: DiagnosticExecutionRecord, terminal: DiagnosticExecutionRecord, current: boolean,
): DiagnosticExecutionAttempt {
  return {
    attemptId: reservation.attemptId,
    jobId: reservation.jobId,
    status: terminal.status as DiagnosticExecutionAttempt['status'],
    envelope: terminal.envelope === null
      ? null
      : structuredClone(terminal.envelope) as DiagnosticEnvelope,
    error: terminal.error,
    current,
  };
}


class InvalidDiagnosticResultError extends Error {}

function definitiveResultFailure(error: unknown): boolean {
  if (error instanceof InvalidDiagnosticResultError) return true;
  return error instanceof ApiError && error.status < 500 && ![408, 429].includes(error.status) && (
    ['RESPOSTA_INVALIDA', 'VERSAO_INCOMPATIVEL'].includes(error.code)
    || (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status))
  );
}


async function persistDeferredReservation(
  authority: DiagnosticStudyAuthority, ownerSub: string, epoch: number,
  reservedStudy: StudyDocument, reservation: DiagnosticExecutionRecord, signal: AbortSignal,
): Promise<void> {
  if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) return;
  await authority.flush();
  if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) return;
  const current = authority.snapshot.document;
  const attached = current?.id === reservedStudy.id;
  const base = attached ? current : reservedStudy;
  const withReservation = await appendDiagnosticExecution(base, reservation, reservation.createdAt);
  if (!sessionIsCurrent(authority, ownerSub, epoch, signal)) return;
  if (attached) {
    authority.edit(withReservation);
    await authority.flush();
  } else {
    await authority.saveDetachedStudy(withReservation, base.revision);
  }
}
