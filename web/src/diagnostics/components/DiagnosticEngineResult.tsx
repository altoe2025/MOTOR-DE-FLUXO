import type { DiagnosticExecutionRecord } from '../../study/model';
import { formatMoney } from '../../presentation/format';
import { ComparisonSummary } from '../../ui/ComparisonSummary';
import { CostTable } from '../../ui/CostTable';
import { describeSelectedRepetition } from '../selectedRepetition';

type DiagnosticEnvelope = NonNullable<DiagnosticExecutionRecord['envelope']>;

/**
 * Topo do resultado: quanto a economia varia entre as carteiras simuladas e qual delas é
 * detalhada abaixo e no Replay. Entrada fixa tem uma só execução, sem intervalo.
 */
function SavingsDistributionSummary({ envelope }: Readonly<{ envelope: DiagnosticEnvelope }>) {
  if (envelope.statistics === undefined) return null;
  const selected = describeSelectedRepetition(envelope);
  const savings = envelope.axes?.economic_robustness.savings_brl;
  if (envelope.statistics.kind !== 'DISTRIBUTION' || savings === undefined || savings.state !== 'AVAILABLE') {
    return <section className="savings-distribution" aria-labelledby="savings-distribution-title">
      <h2 id="savings-distribution-title">Economia desta carteira</h2>
      <p>Execução única (entrada fixa): as ordens são as informadas, então não há intervalo entre carteiras.</p>
    </section>;
  }
  const { p10, p50, p90, amplitude } = savings.value;
  return <section className="savings-distribution" aria-labelledby="savings-distribution-title">
    <h2 id="savings-distribution-title">Economia nas carteiras simuladas</h2>
    <dl className="savings-distribution__values">
      <div><dt>P10</dt><dd>{formatMoney(p10)}</dd></div>
      <div><dt>P50</dt><dd>{formatMoney(p50)}</dd></div>
      <div><dt>P90</dt><dd>{formatMoney(p90)}</dd></div>
      <div><dt>Amplitude</dt><dd>{formatMoney(amplitude)}</dd></div>
    </dl>
    <p>{envelope.statistics.count} repetições. Execução selecionada para detalhamento/Replay: repetição {selected.position} de {selected.total} — {selected.criterion}</p>
    <p className="field-hint">A distribuição vem das carteiras simuladas a partir das mesmas premissas; mostra a variação entre elas, não é probabilidade de desempenho futuro.</p>
  </section>;
}

export function DiagnosticEngineResult({ envelope }: Readonly<{ envelope: DiagnosticEnvelope }>) {
  const selectedExecution = envelope.selected_execution;
  const hasCanonicalResult = selectedExecution.result !== null
    && typeof selectedExecution.result === 'object'
    && 'agregado' in selectedExecution.result;
  if (!hasCanonicalResult) return null;
  return <>
    <SavingsDistributionSummary envelope={envelope} />
    <ComparisonSummary envelope={selectedExecution} />
    <CostTable envelope={selectedExecution} />
  </>;
}
