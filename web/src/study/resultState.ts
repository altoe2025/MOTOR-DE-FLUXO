import type { ExecutionRecord, ResultState, StudyDocument } from './model';

export function deriveResultState(
  _study: StudyDocument,
  execution: ExecutionRecord | null,
  keys: { numeric: string; evidence: string } | null,
  build: string | null,
): ResultState {
  if (execution === null) return { kind: 'AUSENTE' };
  if (keys === null) {
    return {
      kind: 'DESATUALIZADO',
      execution_id: execution.id,
      reasons: ['ENTRADA_INCOMPLETA'],
    };
  }
  const reasons: Extract<ResultState, { kind: 'DESATUALIZADO' }>['reasons'] = [];
  if (execution.numeric_key !== keys.numeric) reasons.push('ENTRADAS_ALTERADAS');
  if (execution.evidence_key !== keys.evidence) reasons.push('PROVENIENCIA_ALTERADA');
  if (build !== null && execution.envelope.motor_build_sha !== build) reasons.push('VERSAO_ALTERADA');
  if (reasons.length > 0) {
    return { kind: 'DESATUALIZADO', execution_id: execution.id, reasons };
  }
  return {
    kind: 'ATUAL',
    execution_id: execution.id,
    server_version: build === null ? 'NAO_VERIFICADA' : 'VERIFICADA',
  };
}
