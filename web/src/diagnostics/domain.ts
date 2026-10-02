import type { DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { assertValidStudy, validateExecutionRecord } from '../study/validation';
import {
  diagnosticAttemptHasPersistedShape,
  diagnosticAttemptIdentityMatches,
} from './attemptIdentity';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);

export function assertDiagnosticAttemptPair(
  reservation: DiagnosticExecutionRecord,
  terminal: DiagnosticExecutionRecord,
): void {
  if (reservation.status !== 'QUEUED' || !TERMINAL.has(terminal.status)) {
    throw new Error('Tentativa diagnóstica atômica exige reserva QUEUED e terminal.');
  }
  if (reservation.id === terminal.id) {
    throw new Error('Execução diagnóstica já anexada.');
  }
  if (!diagnosticAttemptIdentityMatches(reservation, terminal)
    || !diagnosticAttemptHasPersistedShape([reservation, terminal])) {
    throw new Error('Terminal diagnóstico não corresponde exatamente à reserva QUEUED.');
  }
  if (terminal.finishedAt === null) throw new Error('Terminal diagnóstico exige instante de conclusão.');
  const timestamp = new Date(terminal.finishedAt);
  if (Number.isNaN(timestamp.valueOf()) || !terminal.finishedAt.endsWith('Z')) {
    throw new Error('Instante inválido.');
  }
}

/** Validate only the new pair against the current stored scenario. No history traversal. */
export function assertDiagnosticAttemptForStudy(
  study: Omit<StudyDocument, 'executions'>,
  reservation: DiagnosticExecutionRecord,
  terminal: DiagnosticExecutionRecord,
): void {
  assertDiagnosticAttemptPair(reservation, terminal);
  const scenario = study.scenarios.find((item) => item.id === reservation.scenarioId);
  if (study.deletedAt !== null || scenario === undefined
    || scenario.revision !== reservation.scenarioRevision
    || scenario.inputFingerprint !== reservation.inputFingerprint) {
    throw new Error('Cenário ou fingerprint da tentativa não corresponde ao cenário atual.');
  }
  const context = { ...study, executions: [] };
  for (const execution of [reservation, terminal]) {
    if (execution.kind !== 'DIAGNOSTIC') throw new Error('Execução não diagnóstica.');
    const validation = validateExecutionRecord(execution, context);
    if (!validation.ok) throw new Error(validation.issues[0]?.message ?? 'Execução inválida.');
  }
}

export async function appendDiagnosticAttemptAtomically(
  study: StudyDocument,
  reservation: DiagnosticExecutionRecord,
  terminal: DiagnosticExecutionRecord,
): Promise<StudyDocument> {
  assertDiagnosticAttemptPair(reservation, terminal);
  if (study.executions.some((existing) => existing.id === reservation.id || existing.id === terminal.id)) {
    throw new Error('Execução diagnóstica já anexada.');
  }
  if (study.executions.some((existing) => existing.kind === 'DIAGNOSTIC'
    && existing.attemptId === reservation.attemptId)) {
    throw new Error('Tentativa diagnóstica já possui registro persistido.');
  }
  const result: StudyDocument = {
    ...structuredClone(study),
    executions: [
      ...study.executions.map((item) => structuredClone(item)),
      structuredClone(reservation),
      structuredClone(terminal),
    ],
    revision: study.revision + 1,
    updatedAt: terminal.finishedAt!,
  };
  await assertValidStudy(result);
  return result;
}

export async function appendDiagnosticExecution(
  study: StudyDocument,
  execution: DiagnosticExecutionRecord,
  now: string,
): Promise<StudyDocument> {
  if (execution.status !== 'QUEUED' && !TERMINAL.has(execution.status)) {
    throw new Error('Status diagnóstico transitório não pode ser persistido.');
  }
  if (study.executions.some((existing) => existing.id === execution.id)) {
    throw new Error('Execução diagnóstica já anexada.');
  }
  const sameAttempt = study.executions.filter((existing): existing is DiagnosticExecutionRecord =>
    existing.kind === 'DIAGNOSTIC' && existing.attemptId === execution.attemptId);
  const terminals = sameAttempt.filter((existing) => TERMINAL.has(existing.status));
  if (TERMINAL.has(execution.status) && terminals.length > 0) {
    throw new Error('Tentativa diagnóstica já possui terminal.');
  }
  if (!TERMINAL.has(execution.status) && sameAttempt.length > 0) {
    throw new Error('Tentativa diagnóstica já possui reserva.');
  }
  if (TERMINAL.has(execution.status)) {
    const reservations = sameAttempt.filter((existing) => existing.status === 'QUEUED');
    if (reservations.length !== 1
      || !diagnosticAttemptIdentityMatches(reservations[0]!, execution)) {
      throw new Error('Terminal diagnóstico não corresponde exatamente à reserva QUEUED.');
    }
  }
  if (!diagnosticAttemptHasPersistedShape([...sameAttempt, execution])) {
    throw new Error('Tentativa diagnóstica possui forma persistida inválida.');
  }
  const timestamp = new Date(now);
  if (Number.isNaN(timestamp.valueOf()) || !now.endsWith('Z')) {
    throw new Error('Instante inválido.');
  }
  const result: StudyDocument = {
    ...structuredClone(study),
    executions: [...study.executions.map((item) => structuredClone(item)), structuredClone(execution)],
    revision: study.revision + 1,
    updatedAt: now,
  };
  await assertValidStudy(result);
  return result;
}
