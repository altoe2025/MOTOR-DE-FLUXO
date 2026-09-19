import type { ExecutionRecord, ResultState, ScenarioDocument } from './model';

export function deriveResultState(
  scenario: ScenarioDocument,
  execution: ExecutionRecord | null,
): ResultState {
  if (execution === null) return { kind: 'ABSENT' };
  const reasons: Extract<ResultState, { kind: 'STALE' }>['reasons'][number][] = [];
  if (execution.inputFingerprint !== scenario.inputFingerprint) reasons.push('INPUT_CHANGED');
  if (execution.scenarioId !== scenario.id || execution.scenarioRevision !== scenario.revision) {
    reasons.push('SCENARIO_REVISION_CHANGED');
  }
  if (reasons.length > 0) {
    return { kind: 'STALE', executionId: execution.id, reasons };
  }
  return { kind: 'CURRENT', executionId: execution.id, status: execution.status };
}
