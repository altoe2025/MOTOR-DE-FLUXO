import type { DiagnosticExecutionRecord } from '../../study/model';
import { ComparisonSummary } from '../../ui/ComparisonSummary';
import { CostTable } from '../../ui/CostTable';

type DiagnosticEnvelope = NonNullable<DiagnosticExecutionRecord['envelope']>;

export function DiagnosticEngineResult({ envelope }: Readonly<{ envelope: DiagnosticEnvelope }>) {
  const selectedExecution = envelope.selected_execution;
  const hasCanonicalResult = selectedExecution.result !== null
    && typeof selectedExecution.result === 'object'
    && 'agregado' in selectedExecution.result;
  if (!hasCanonicalResult) return null;
  return <>
    <ComparisonSummary envelope={selectedExecution} />
    <CostTable envelope={selectedExecution} />
  </>;
}
