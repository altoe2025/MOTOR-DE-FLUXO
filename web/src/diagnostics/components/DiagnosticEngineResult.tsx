import type { DiagnosticExecutionRecord } from '../../study/model';
import { formatMoney } from '../../presentation/format';
import { FlowVolumes, MechanismComposition, ResultHeadline } from '../../ui/ComparisonSummary';
import { CostTable } from '../../ui/CostTable';
import { Disclosure } from '../../ui/Disclosure';
import { HelpTip } from '../../ui/HelpTip';
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
    return <section className="savings-distribution summary-line" aria-labelledby="savings-distribution-title">
      <h2 id="savings-distribution-title" className="summary-line__key">Economia desta carteira</h2>
      <p className="summary-line__value">Execução única (entrada fixa): as ordens são as informadas, então não há intervalo entre carteiras.</p>
    </section>;
  }
  const { p10, p50, p90, amplitude } = savings.value;
  return <section className="savings-distribution summary-line" aria-labelledby="savings-distribution-title">
    <h2 id="savings-distribution-title" className="summary-line__key">Economia nas carteiras simuladas</h2>
    <dl className="savings-distribution__values summary-line__value">
      <div><dt>P10</dt><dd>{formatMoney(p10)}</dd></div>
      <div><dt>P50</dt><dd>{formatMoney(p50)}</dd></div>
      <div><dt>P90</dt><dd>{formatMoney(p90)}</dd></div>
      <div><dt>Amplitude</dt><dd>{formatMoney(amplitude)}</dd></div>
    </dl>
    <p className="field-hint savings-distribution__note">{envelope.statistics.count} repetições. Execução selecionada para detalhamento/Replay: repetição {selected.position} de {selected.total} — {selected.criterion}
      {' '}<HelpTip label="Faixa da economia">A distribuição vem das carteiras simuladas a partir das mesmas premissas; mostra a variação entre elas, não é probabilidade de desempenho futuro.</HelpTip></p>
  </section>;
}

export function DiagnosticEngineResult({ envelope }: Readonly<{ envelope: DiagnosticEnvelope }>) {
  const selectedExecution = envelope.selected_execution;
  const hasCanonicalResult = selectedExecution.result !== null
    && typeof selectedExecution.result === 'object'
    && 'agregado' in selectedExecution.result;
  if (!hasCanonicalResult) return null;
  return <>
    <ResultHeadline envelope={selectedExecution} />
    <SavingsDistributionSummary envelope={envelope} />
    <div className="result-details">
      <Disclosure id="result-flow" label="Como a economia se forma" hint="mesmo cliente, entre clientes e remetido">
        <FlowVolumes envelope={selectedExecution} />
        <MechanismComposition envelope={selectedExecution} />
      </Disclosure>
      <Disclosure id="result-costs" label="Custos por componente" hint="IOF, spread, tarifa e carregamento">
        <CostTable envelope={selectedExecution} />
      </Disclosure>
    </div>
  </>;
}
