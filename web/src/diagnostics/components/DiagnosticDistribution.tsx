import type { DiagnosticExecutionRecord } from '../../study/model';
import { formatMetric, type ChartSeries } from '../presentation';
import { ChartWithTable } from './EChart';

type DiagnosticEnvelope = NonNullable<DiagnosticExecutionRecord['envelope']>;
type DistributionProps = Readonly<{
  statistics: DiagnosticEnvelope['statistics'];
  repetitions: DiagnosticEnvelope['repetitions'];
  economics: DiagnosticEnvelope['axes']['economic_robustness'];
}>;

export function DiagnosticDistribution({ statistics, repetitions, economics }: DistributionProps) {
  if (statistics.kind !== 'DISTRIBUTION') {
    const reason = economics.savings_brl.state === 'AVAILABLE'
      ? 'Entrada fixa não produz uma distribuição amostral.'
      : economics.savings_brl.reason;
    return <section className="diagnostic-card" aria-labelledby="distribution-heading">
      <h2 id="distribution-heading">Distribuição de repetições</h2>
      <p className="evidence-unavailable">Distribuição indisponível: {reason}</p>
    </section>;
  }
  const savingsSeries: ChartSeries = {
    name: 'Economia por repetição', unit: 'BRL', kind: 'line',
    points: repetitions.map((item, index) => ({ label: `R${index + 1}`, value: item.savings_brl })),
  };
  const summaries = [
    ['Baseline', economics.baseline_brl, 'BRL' as const],
    ['Custo netado', economics.netted_brl, 'BRL' as const],
    ['Economia', economics.savings_brl, 'BRL' as const],
    ['Netabilidade', economics.netability_fraction, 'FRACTION' as const],
  ] as const;
  return <section className="diagnostic-card" aria-labelledby="distribution-heading">
    <h2 id="distribution-heading">Distribuição de repetições</h2>
    <p>{statistics.count} repetições · método {statistics.percentile_method}</p>
    <ChartWithTable series={savingsSeries} description="Economia observada em cada repetição; cada ponto é identificado também na tabela." />
    <div className="table-scroll"><table className="diagnostic-table">
      <caption>Percentis recebidos do diagnóstico</caption>
      <thead><tr><th scope="col">Métrica</th><th scope="col">P10</th><th scope="col">P50</th><th scope="col">P90</th><th scope="col">Amplitude</th></tr></thead>
      <tbody>{summaries.map(([label, metric, unit]) => <tr key={label}><th scope="row">{label}</th>{metric.state === 'AVAILABLE' ? <>
        <td>{formatMetric(metric.value.p10, unit)}</td><td>{formatMetric(metric.value.p50, unit)}</td><td>{formatMetric(metric.value.p90, unit)}</td><td>{formatMetric(metric.value.amplitude, unit)}</td>
      </> : <td colSpan={4}>{metric.reason}</td>}</tr>)}</tbody>
    </table></div>
  </section>;
}
