import type { CommunicationDocumentV1 } from '../../communication/domain';
import { PRIMARY_EXECUTIVE_METRIC_CODES } from '../domain';
import { FactList, MetricList } from './DocumentItems';

export function ComparisonSection({ document }: Readonly<{ document: CommunicationDocumentV1 }>) {
  return <section id="comparacao" aria-labelledby="comparacao-title" data-route-id="presentation" data-help-id="page.comparacao">
    <h2 id="comparacao-title">Consequência econômica e comparação</h2>
    <h3>Outros indicadores executivos</h3>
    <MetricList document={document} metrics={document.executiveMetrics.filter((metric) => !PRIMARY_EXECUTIVE_METRIC_CODES.has(metric.code))} />
    <h3>Custos e volumes</h3>
    <MetricList document={document} metrics={document.economics.metrics} />
    <h3>Robustez</h3>
    {document.robustness.metrics.some((metric) => metric.availability === 'UNAVAILABLE')
      ? <p>Distribuição indisponível quando a evidência da execução não a sustenta.</p> : null}
    <MetricList document={document} metrics={document.robustness.metrics} />
    <FactList document={document} facts={document.robustness.facts} />
    <h3>Comparação selecionada</h3>
    {document.comparison === null ? <p>Nenhuma comparação selecionada para esta execução.</p>
      : <><MetricList document={document} metrics={document.comparison.metrics} />
        <FactList document={document} facts={document.comparison.facts} /></>}
  </section>;
}
