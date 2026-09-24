import type { CommunicationDocumentV1 } from '../../communication/domain';
import { FactList, MetricList } from './DocumentItems';

export function CompositionSection({ document }: Readonly<{ document: CommunicationDocumentV1 }>) {
  return <section id="composicao" aria-labelledby="composicao-title" data-route-id="presentation" data-help-id="concept.composicao">
    <h2 id="composicao-title">Composição e mecanismo</h2>
    <h3>Origem e composição</h3>
    <FactList document={document} facts={document.composition.facts} />
    <MetricList document={document} metrics={document.composition.metrics} />
    <h3>Mecanismo publicado</h3>
    <MetricList document={document} metrics={document.mechanism.metrics} />
    <FactList document={document} facts={document.mechanism.facts} />
  </section>;
}
