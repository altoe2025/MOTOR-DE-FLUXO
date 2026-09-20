import type { PreviaRequest, PreviewEnvelope } from '../api/client';
import { validatePreviewEnvelope } from '../api/validators';
import { compareObservedToMotor } from '../cases/observedComparison';
import { appendExecution } from './domain';
import { canonicalInputSnapshot } from './fingerprints';
import type { ExecutionRecord, ExecutionStatus, ScenarioDocument, StudyDocument } from './model';
import type { StudyController } from './studyController';

export type ExecutionAttempt = Readonly<{
  id: string;
  status: ExecutionStatus;
  request: ExecutionRecord['requestSnapshot'] | null;
  envelope: PreviewEnvelope | null;
  error: unknown | null;
  persistenceError: unknown | null;
  current: boolean;
}>;

export type ExecutionRequestContext = Readonly<{
  requestId: string;
  executionId: string;
  study: StudyDocument;
  scenario: ScenarioDocument;
}>;

export type ExecuteStudyScenarioOptions = Readonly<{
  controller: StudyController;
  scenarioId: string;
  buildRequest(context: ExecutionRequestContext): PreviaRequest;
  runPreview(input: PreviaRequest, signal: AbortSignal): Promise<PreviewEnvelope>;
  nextId?: () => string;
  now?: () => string;
  reservationLeaseMs?: number;
  onStatus?: (attempt: ExecutionAttempt) => void;
}>;

export class ExecutionInProgressError extends Error {
  constructor(readonly executionId: string) {
    super('Já existe uma execução persistida em andamento para este cenário.');
    this.name = 'ExecutionInProgressError';
  }
}

const inFlight = new WeakMap<StudyController, Map<string, Promise<ExecutionAttempt>>>();
const DEFAULT_RESERVATION_LEASE_MS = 5 * 60_000;

function defaultId(): string { return crypto.randomUUID(); }
function defaultNow(): string { return new Date().toISOString(); }

function attempt(
  id: string,
  status: ExecutionStatus,
  request: ExecutionRecord['requestSnapshot'] | null,
  overrides: Partial<ExecutionAttempt> = {},
): ExecutionAttempt {
  return Object.freeze({
    id,
    status,
    request,
    envelope: null,
    error: null,
    persistenceError: null,
    current: false,
    ...overrides,
  });
}

function assertRequestIdentity(
  request: PreviaRequest,
  context: ExecutionRequestContext,
): void {
  if (request.request_id !== context.requestId
    || request.study_id !== context.study.id
    || request.scenario_id !== context.scenario.id
    || request.scenario_revision !== context.scenario.revision) {
    throw new Error('Request canônico diverge do snapshot reservado.');
  }
}

function assertEnvelope(
  request: PreviaRequest,
  envelope: PreviewEnvelope,
): void {
  if (!validatePreviewEnvelope(envelope)
    || envelope.api_version !== request.api_version
    || envelope.request_id !== request.request_id
    || envelope.study_id !== request.study_id
    || envelope.scenario_id !== request.scenario_id
    || envelope.scenario_revision !== request.scenario_revision
    || canonicalInputSnapshot(envelope.input_snapshot) !== canonicalInputSnapshot({
      cenario: request.cenario,
      periodo: request.periodo,
      proveniencia: request.proveniencia,
    })) {
    throw new Error('Envelope incompatível com a tentativa reservada.');
  }
}

function activeReservation(study: StudyDocument, scenarioId: string): ExecutionRecord | null {
  const completedRequests = new Set(study.executions
    .filter((execution) => execution.status !== 'PREPARING' && execution.status !== 'RUNNING')
    .map((execution) => execution.requestSnapshot.request_id));
  return study.executions.find((execution) =>
    execution.scenarioId === scenarioId
    && (execution.status === 'PREPARING' || execution.status === 'RUNNING')
    && !completedRequests.has(execution.requestSnapshot.request_id)) ?? null;
}

function reservationExpired(reservation: ExecutionRecord, now: string, leaseMs: number): boolean {
  return Date.parse(now) - Date.parse(reservation.createdAt) >= leaseMs;
}

function terminalExists(
  study: StudyDocument,
  attemptId: string,
  requestId: string,
): boolean {
  return study.executions.some((execution) =>
    execution.status !== 'PREPARING'
    && execution.status !== 'RUNNING'
    && (execution.attemptId === attemptId
      || execution.requestSnapshot.request_id === requestId));
}

async function appendInterruption(
  study: StudyDocument,
  reservation: ExecutionRecord,
  terminalId: string,
  finishedAt: string,
): Promise<StudyDocument> {
  const attemptId = reservation.attemptId ?? reservation.id;
  if (terminalExists(study, attemptId, reservation.requestSnapshot.request_id)) return study;
  return appendExecution(study, {
    ...structuredClone(reservation),
    id: terminalId,
    attemptId,
    status: 'INTERRUPTED',
    finishedAt,
  }, finishedAt);
}

async function persistTerminal(
  options: ExecuteStudyScenarioOptions,
  capturedOwner: string,
  capturedEpoch: number,
  reservedStudy: StudyDocument,
  reservationId: string,
  record: ExecutionRecord,
  finishedAt: string,
): Promise<{ current: boolean; persistenceError: unknown | null }> {
  const { controller } = options;
  if (controller.snapshot.ownerSub !== capturedOwner || controller.snapshot.sessionEpoch !== capturedEpoch) {
    return { current: false, persistenceError: null };
  }
  try {
    await controller.flush();
    const currentStudy = controller.snapshot.document;
    if (currentStudy === null || currentStudy.id !== record.requestSnapshot.study_id) {
      if (terminalExists(reservedStudy, record.attemptId ?? reservationId, record.requestSnapshot.request_id)) {
        return { current: false, persistenceError: null };
      }
      const detached = await appendExecution(reservedStudy, record, finishedAt);
      await controller.saveDetachedStudy(detached, reservedStudy.revision);
      return { current: false, persistenceError: null };
    }
    const currentScenario = currentStudy.scenarios.find((item) => item.id === record.scenarioId);
    const current = currentScenario?.inputFingerprint === record.inputFingerprint;
    if (terminalExists(currentStudy, record.attemptId ?? reservationId, record.requestSnapshot.request_id)) {
      return { current, persistenceError: null };
    }
    const withExecution = await appendExecution(currentStudy, record, finishedAt);
    controller.edit(withExecution);
    await controller.flush();
    return { current, persistenceError: null };
  } catch (error) {
    const currentStudy = controller.snapshot.document;
    const currentScenario = currentStudy?.scenarios.find((item) => item.id === record.scenarioId);
    return {
      current: currentScenario?.inputFingerprint === record.inputFingerprint,
      persistenceError: error,
    };
  }
}

async function execute(options: ExecuteStudyScenarioOptions): Promise<ExecutionAttempt> {
  const nextId = options.nextId ?? defaultId;
  const now = options.now ?? defaultNow;
  const reservationLeaseMs = options.reservationLeaseMs ?? DEFAULT_RESERVATION_LEASE_MS;
  if (!Number.isFinite(reservationLeaseMs) || reservationLeaseMs <= 0) {
    throw new Error('Lease de reserva inválido.');
  }
  const executionId = nextId();
  const requestId = nextId();
  const preparing = attempt(executionId, 'PREPARING', null);
  options.onStatus?.(preparing);
  let request: PreviaRequest | null = null;
  let finalAttempt: ExecutionAttempt;
  try {
    const result = await options.controller.runForCurrentSession(async ({ ownerSub, epoch, signal }) => {
      await options.controller.flush();
      let study = options.controller.snapshot.document;
      if (study === null) throw new Error('Nenhum estudo selecionado para execução.');
      const existing = activeReservation(study, options.scenarioId);
      if (existing !== null) {
        const inspectedAt = now();
        if (!reservationExpired(existing, inspectedAt, reservationLeaseMs)) {
          return attempt(existing.id, 'INTERRUPTED', existing.requestSnapshot, {
            error: new ExecutionInProgressError(existing.id),
          });
        }
        const interrupted = await appendInterruption(study, existing, nextId(), inspectedAt);
        options.controller.edit(interrupted);
        const reconciled = await options.controller.flush();
        if (reconciled === null) {
          return attempt(existing.id, 'INTERRUPTED', existing.requestSnapshot);
        }
        study = reconciled;
      }
      const scenario = study.scenarios.find((item) => item.id === options.scenarioId);
      if (scenario === undefined) throw new Error('Cenário não encontrado para execução.');
      const context = { requestId, executionId, study, scenario };
      request = options.buildRequest(context);
      assertRequestIdentity(request, context);

      const createdAt = now();
      const reservation: ExecutionRecord = {
        id: executionId,
        attemptId: executionId,
        scenarioId: scenario.id,
        scenarioRevision: scenario.revision,
        inputFingerprint: scenario.inputFingerprint,
        requestSnapshot: structuredClone(request),
        sourceSnapshot: structuredClone(scenario.sourceSnapshot),
        premisesSnapshot: structuredClone(scenario.premises),
        periodSnapshot: structuredClone(scenario.period),
        engineVersion: 'pending',
        contractVersion: request.api_version,
        status: 'RUNNING',
        envelope: null,
        observedComparison: null,
        createdAt,
        finishedAt: null,
      };
      const withReservation = await appendExecution(study, reservation, createdAt);
      options.controller.edit(withReservation);
      const reserved = await options.controller.flush();
      if (reserved === null || signal.aborted) {
        let persistenceError: unknown | null = null;
        if (options.controller.snapshot.ownerSub === ownerSub
          && options.controller.snapshot.sessionEpoch === epoch) {
          try {
            await options.controller.saveDetachedStudy(
              await appendInterruption(withReservation, reservation, nextId(), now()),
              withReservation.revision,
            );
          } catch (error) {
            persistenceError = error;
          }
        }
        return attempt(executionId, 'INTERRUPTED', request, { persistenceError });
      }

      const running = attempt(executionId, 'RUNNING', request);
      options.onStatus?.(running);
      let envelope: PreviewEnvelope | null = null;
      let failure: unknown = null;
      try {
        const response = await options.runPreview(request, signal);
        assertEnvelope(request, response);
        envelope = response;
      } catch (error) {
        failure = error;
      }
      if (signal.aborted
        || options.controller.snapshot.ownerSub !== ownerSub
        || options.controller.snapshot.sessionEpoch !== epoch) {
        return attempt(executionId, 'INTERRUPTED', request, { error: failure });
      }

      const finishedAt = now();
      const status: ExecutionStatus = envelope === null ? 'FAILED' : 'SUCCEEDED';
      const record: ExecutionRecord = {
        id: envelope?.execution_id ?? nextId(),
        attemptId: executionId,
        scenarioId: scenario.id,
        scenarioRevision: scenario.revision,
        inputFingerprint: scenario.inputFingerprint,
        requestSnapshot: structuredClone(request),
        sourceSnapshot: structuredClone(scenario.sourceSnapshot),
        premisesSnapshot: structuredClone(scenario.premises),
        periodSnapshot: structuredClone(scenario.period),
        engineVersion: envelope?.motor_build_sha ?? 'unknown',
        contractVersion: envelope?.api_version ?? request.api_version,
        status,
        envelope: envelope === null ? null : structuredClone(envelope),
        observedComparison: envelope !== null && scenario.sourceSnapshot.observedOutcome !== null
          ? compareObservedToMotor(scenario.sourceSnapshot.observedOutcome, envelope)
          : null,
        createdAt,
        finishedAt,
      };
      const persisted = await persistTerminal(
        options,
        ownerSub,
        epoch,
        reserved,
        reservation.id,
        record,
        finishedAt,
      );
      return attempt(executionId, status, request, {
        envelope,
        error: failure,
        persistenceError: persisted.persistenceError,
        current: persisted.current,
      });
    });
    finalAttempt = result ?? attempt(executionId, 'INTERRUPTED', request);
  } catch (error) {
    const interrupted = options.controller.snapshot.status === 'CONFLICT'
      || options.controller.snapshot.status === 'CLOSED';
    finalAttempt = attempt(executionId, interrupted ? 'INTERRUPTED' : 'FAILED', request, {
      error,
      persistenceError: options.controller.snapshot.status === 'STORAGE_FAILURE' ? error : null,
    });
  }
  options.onStatus?.(finalAttempt);
  return finalAttempt;
}

export function executeStudyScenario(options: ExecuteStudyScenarioOptions): Promise<ExecutionAttempt> {
  let byScenario = inFlight.get(options.controller);
  if (byScenario === undefined) {
    byScenario = new Map();
    inFlight.set(options.controller, byScenario);
  }
  const existing = byScenario.get(options.scenarioId);
  if (existing !== undefined) return existing;
  const running = execute(options);
  byScenario.set(options.scenarioId, running);
  const cleanup = () => {
    if (byScenario?.get(options.scenarioId) === running) byScenario.delete(options.scenarioId);
  };
  void running.then(cleanup, cleanup);
  return running;
}
