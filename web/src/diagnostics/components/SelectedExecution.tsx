import type { DiagnosticExecutionRecord } from '../../study/model';
import { ComparisonSummary } from '../../ui/ComparisonSummary';
import { CostTable } from '../../ui/CostTable';
import { Link } from 'react-router-dom';
import { describeSelectedRepetition } from '../selectedRepetition';

type DiagnosticEnvelope = NonNullable<DiagnosticExecutionRecord['envelope']>;
type SelectedExecutionProps = Readonly<{
  envelope: DiagnosticEnvelope;
  iofRules: DiagnosticExecutionRecord['premisesSnapshot']['costs']['iof_por_finalidade'];
  replayHref?: string;
}>;

export function SelectedExecution({ envelope, iofRules, replayHref }: SelectedExecutionProps) {
  const selectedExecution = envelope.selected_execution;
  const selected = describeSelectedRepetition(envelope);
  const hasIofFallback = selectedExecution.input_snapshot.cenario?.ordens.some((order) =>
    order.finalidade === null || !iofRules.some((rule) =>
      rule.finalidade === order.finalidade && rule.direcao === order.direcao));
  const hasCanonicalResult = selectedExecution.result !== null
    && typeof selectedExecution.result === 'object'
    && 'agregado' in selectedExecution.result;
  return <section className="diagnostic-card" aria-labelledby="selected-execution-heading">
    <h2 id="selected-execution-heading">Execução selecionada</h2>
    <dl className="diagnostic-identity">
      <div><dt>Execução</dt><dd>{selectedExecution.execution_id}</dd></div>
      <div><dt>Fingerprint</dt><dd>{selectedExecution.execution_fingerprint}</dd></div>
      <div><dt>ID da repetição</dt><dd>{selected.repetitionId}</dd></div>
      <div><dt>Total executado</dt><dd>{selected.total} {selected.total === 1 ? 'repetição' : 'repetições'}</dd></div>
      <div><dt>Critério de seleção</dt><dd>{selected.criterion}</dd></div>
      <div><dt>Build do motor</dt><dd>{selectedExecution.motor_build_sha}</dd></div>
      <div><dt>Versão da apresentação</dt><dd>{selectedExecution.presentation_version}</dd></div>
      <div><dt>Fingerprint de proveniência</dt><dd>{selectedExecution.provenance_fingerprint}</dd></div>
    </dl>
    {hasIofFallback ? <p>
      <strong>IOF padrão por direção</strong>: ordens sem regra específica para a combinação de finalidade e direção usam as premissas da simulação por direção, sem classificação regulatória inferida ou cotação.
    </p> : null}
    <p>Uma repetição é uma realização do cenário com seeds planejadas. O Replay mostra apenas esta repetição, não a distribuição inteira.</p>
    {replayHref === undefined ? null : <Link className="button-link" to={replayHref}>Abrir Replay · Fronteira Viva</Link>}
    {hasCanonicalResult ? <>
      <ComparisonSummary envelope={selectedExecution} /><CostTable envelope={selectedExecution} />
    </> : null}
  </section>;
}
