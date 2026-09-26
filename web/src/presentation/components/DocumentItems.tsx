import type { CommunicationDocumentV1, CommunicationMetric } from '../../communication/domain';
import { formatCommunicationMetric } from '../domain';

type DocumentProps = Readonly<{ document: CommunicationDocumentV1 }>;

/** A evidência continua rastreável nos atributos, sem poluir o texto visível. */
export function evidenceAttributes(document: CommunicationDocumentV1, refs: readonly string[]) {
  return {
    'data-evidence-refs': refs.join(' '),
    'data-source-ids': refs.map((ref) => document.evidenceIndex[ref]?.sourceId ?? '').join(' '),
  };
}

export function hasEvidence(document: CommunicationDocumentV1, refs: readonly string[]): boolean {
  return refs.length > 0 && refs.every((ref) => Object.hasOwn(document.evidenceIndex, ref));
}

export function metricText(document: CommunicationDocumentV1, metric: CommunicationMetric): string {
  return hasEvidence(document, metric.evidenceRefs) ? formatCommunicationMetric(metric) : 'Não disponível';
}

export function MetricList({ document, metrics, labels = {} }: DocumentProps & Readonly<{
  metrics: readonly CommunicationMetric[];
  labels?: Readonly<Record<string, string>>;
}>) {
  return <dl className="presentation-metrics">{metrics.map((metric) => <div key={metric.code}
    className="presentation-metric" data-testid="presentation-metric" {...evidenceAttributes(document, metric.evidenceRefs)}>
    <dt>{labels[metric.code] ?? metric.label}</dt>
    <dd>{metricText(document, metric)}</dd>
  </div>)}</dl>;
}
