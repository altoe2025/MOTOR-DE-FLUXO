import type { DiagnosticExecutionRecord } from '../../study/model';
import { ComparisonSummary } from '../../ui/ComparisonSummary';
import { CostTable } from '../../ui/CostTable';
import { Link } from 'react-router-dom';

type DiagnosticEnvelope = NonNullable<DiagnosticExecutionRecord['envelope']>;
type SelectedExecutionProps = Readonly<{
  selectedExecution: DiagnosticEnvelope['selected_execution'];
  replayHref?: string;
}>;

export function SelectedExecution({ selectedExecution, replayHref }: SelectedExecutionProps) {
  const hasCanonicalResult = selectedExecution.result !== null
    && typeof selectedExecution.result === 'object'
    && 'agregado' in selectedExecution.result;
  return <section className="diagnostic-card" aria-labelledby="selected-execution-heading">
    <h2 id="selected-execution-heading">Execução selecionada</h2>
    <dl className="diagnostic-identity">
      <div><dt>Execução</dt><dd>{selectedExecution.execution_id}</dd></div>
      <div><dt>Fingerprint</dt><dd>{selectedExecution.execution_fingerprint}</dd></div>
      <div><dt>Repetição</dt><dd>{selectedExecution.statistics.repetition_id}</dd></div>
      <div><dt>Build do motor</dt><dd>{selectedExecution.motor_build_sha}</dd></div>
      <div><dt>Versão da apresentação</dt><dd>{selectedExecution.presentation_version}</dd></div>
      <div><dt>Fingerprint de proveniência</dt><dd>{selectedExecution.provenance_fingerprint}</dd></div>
    </dl>
    {replayHref === undefined ? null : <Link className="button-link" to={replayHref}>Abrir Replay · Fronteira Viva</Link>}
    {hasCanonicalResult ? <><ComparisonSummary envelope={selectedExecution} /><CostTable envelope={selectedExecution} /></> : null}
  </section>;
}
