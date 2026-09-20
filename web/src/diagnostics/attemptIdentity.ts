import { canonical } from '../study/fingerprints';
import type { DiagnosticExecutionRecord } from '../study/model';

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
