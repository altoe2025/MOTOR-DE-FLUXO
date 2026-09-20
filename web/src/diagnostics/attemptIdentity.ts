import { canonical } from '../study/fingerprints';
import type { DiagnosticExecutionRecord } from '../study/model';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);

function immutableAttemptIdentity(record: DiagnosticExecutionRecord) {
  const {
    id: _id,
    status: _status,
    envelope: _envelope,
    error: _error,
    finishedAt: _finishedAt,
    ...identity
  } = structuredClone(record);
  void _id;
  void _status;
  void _envelope;
  void _error;
  void _finishedAt;
  return identity;
}

export function diagnosticAttemptIdentityMatches(
  reservation: DiagnosticExecutionRecord,
  terminal: DiagnosticExecutionRecord,
): boolean {
  return reservation.status === 'QUEUED'
    && canonical(immutableAttemptIdentity(reservation))
      === canonical(immutableAttemptIdentity(terminal));
}

export function diagnosticAttemptHasPersistedShape(
  records: readonly DiagnosticExecutionRecord[],
): boolean {
  if (records.length < 1 || records.length > 2) return false;
  const reservations = records.filter((record) => record.status === 'QUEUED');
  const terminals = records.filter((record) => TERMINAL.has(record.status));
  if (reservations.length !== 1
    || terminals.length > 1
    || records.length !== reservations.length + terminals.length) return false;
  return terminals.length === 0
    || diagnosticAttemptIdentityMatches(reservations[0]!, terminals[0]!);
}
