import type { DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { assertValidStudy } from '../study/validation';
import { diagnosticAttemptIdentityMatches } from './attemptIdentity';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);

export async function appendDiagnosticExecution(
  study: StudyDocument,
  execution: DiagnosticExecutionRecord,
  now: string,
): Promise<StudyDocument> {
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
