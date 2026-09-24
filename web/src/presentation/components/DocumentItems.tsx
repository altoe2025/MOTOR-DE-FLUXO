import type { CommunicationDocumentV1, CommunicationFact, CommunicationMetric } from '../../communication/domain';
import { formatCommunicationMetric } from '../domain';
import { presentFact } from '../facts';

type DocumentProps = Readonly<{ document: CommunicationDocumentV1 }>;

function evidenceAttributes(document: CommunicationDocumentV1, refs: readonly string[]) {
  return {
    'data-evidence-refs': refs.join(' '),
    'data-source-ids': refs.map((ref) => document.evidenceIndex[ref]?.sourceId ?? '').join(' '),
  };
}

function hasEvidence(document: CommunicationDocumentV1, refs: readonly string[]): boolean {
  return refs.length > 0 && refs.every((ref) => Object.hasOwn(document.evidenceIndex, ref));
}

function Evidence({ document, refs }: DocumentProps & Readonly<{ refs: readonly string[] }>) {
  return <small className="presentation-evidence">Fonte: {refs.map((ref) => {
    const evidence = document.evidenceIndex[ref];
    return <span key={ref}> <code>{evidence?.source ?? 'DESCONHECIDA'} · {evidence?.sourceId ?? ref}</code></span>;
  })}</small>;
}

export function MetricList({ document, metrics }: DocumentProps & Readonly<{ metrics: readonly CommunicationMetric[] }>) {
  return <dl className="presentation-metrics">{metrics.map((metric) => {
    const sourced = hasEvidence(document, metric.evidenceRefs);
    return <div key={metric.code}
    className="presentation-metric" data-testid="presentation-metric" {...evidenceAttributes(document, metric.evidenceRefs)}>
    <dt>{metric.label}</dt>
    <dd>
      {sourced ? formatCommunicationMetric(metric) : 'Não disponível'}
      {!sourced ? <p>Referência de evidência ausente no documento.</p>
        : metric.availability === 'UNAVAILABLE' ? <p>{metric.meaning}</p> : null}
      {sourced ? <Evidence document={document} refs={metric.evidenceRefs} /> : null}
    </dd>
  </div>;
  })}</dl>;
}

export function FactList({ document, facts }: DocumentProps & Readonly<{ facts: readonly CommunicationFact[] }>) {
  return <dl className="presentation-facts">{facts.map((fact) => {
    const sourced = hasEvidence(document, fact.evidenceRefs);
    const presented = presentFact(fact);
    return <div key={fact.code}
    {...evidenceAttributes(document, fact.evidenceRefs)}>
    <dt>{presented.label}</dt><dd>
      {sourced ? presented.value : 'Não disponível'}
      {sourced && presented.explanation !== null ? <small className="presentation-fact-explanation">{presented.explanation}</small> : null}
      {sourced && presented.value !== fact.value
        ? <small className="presentation-fact-raw">Valor publicado: <code>{fact.value}</code></small> : null}
      {sourced ? <Evidence document={document} refs={fact.evidenceRefs} />
        : <p>Referência de evidência ausente no documento.</p>}
    </dd>
  </div>;
  })}</dl>;
}
