import type { CommunicationDocumentV1 } from '../../communication/domain';
import { PRIMARY_EXECUTIVE_METRIC_CODES } from '../domain';
import { MetricList } from './DocumentItems';

export function ExecutiveSummary({ document }: Readonly<{ document: CommunicationDocumentV1 }>) {
  return <section id="resumo" aria-labelledby="resumo-title" data-route-id="presentation" data-help-id="page.apresentacao">
    <h2 id="resumo-title">Resumo executivo</h2>
    <p>Valores publicados para a execução e repetição selecionadas.</p>
    <MetricList document={document} metrics={document.executiveMetrics.filter((metric) => PRIMARY_EXECUTIVE_METRIC_CODES.has(metric.code))} />
  </section>;
}
