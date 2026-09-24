import type { DiagnosticExecutionRecord } from '../../study/model';
import { ComparisonSummary } from '../../ui/ComparisonSummary';
import { CostTable } from '../../ui/CostTable';
import { Link } from 'react-router-dom';
import { describeSelectedRepetition } from '../selectedRepetition';
import { AskAboutThis } from '../../help/AskAboutThis';
import { HELP_IDS } from '../../help/helpIds';

type DiagnosticEnvelope = NonNullable<DiagnosticExecutionRecord['envelope']>;
type SelectedExecutionProps = Readonly<{
  envelope: DiagnosticEnvelope;
  replayHref?: string;
}>;

export function SelectedExecution({ envelope, replayHref }: SelectedExecutionProps) {
  const selectedExecution = envelope.selected_execution;
  const selected = describeSelectedRepetition(envelope);
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
    <p>Uma repetição é uma realização do cenário com seeds planejadas. O Replay mostra apenas esta repetição, não a distribuição inteira.</p>
    <AskAboutThis helpId={HELP_IDS.SELECTED_REPETITION} contextKind="REPETITION" />
    {replayHref === undefined ? null : <Link className="button-link" to={replayHref}>Abrir Replay · Fronteira Viva</Link>}
    {hasCanonicalResult ? <>
      <div className="chat-metric-actions" aria-label="Perguntas sobre métricas principais">
        <AskAboutThis helpId={HELP_IDS.DIAGNOSTIC_PAGE} metricId="BASELINE_BRL" label="Perguntar sobre custo baseline" />
        <AskAboutThis helpId={HELP_IDS.DIAGNOSTIC_PAGE} metricId="NETTED_BRL" label="Perguntar sobre custo netado" />
        <AskAboutThis helpId={HELP_IDS.DIAGNOSTIC_PAGE} metricId="SAVINGS_BRL" label="Perguntar sobre economia" />
        <AskAboutThis helpId={HELP_IDS.DIAGNOSTIC_PAGE} metricId="NETABILITY" label="Perguntar sobre netabilidade" />
      </div>
      <ComparisonSummary envelope={selectedExecution} /><CostTable envelope={selectedExecution} />
    </> : null}
  </section>;
}
