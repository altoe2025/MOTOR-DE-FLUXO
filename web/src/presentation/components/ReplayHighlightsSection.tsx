import type { CommunicationDocumentV1 } from '../../communication/domain';
import { FactList, MetricList } from './DocumentItems';

export function ReplayHighlightsSection({ document }: Readonly<{ document: CommunicationDocumentV1 }>) {
  const snapshot = document.replaySnapshot;
  return <section id="replay" aria-labelledby="replay-title" data-route-id="presentation" data-help-id="concept.replay">
    <h2 id="replay-title">Destaques do Replay</h2>
    {snapshot === null ? <p>Nenhum quadro do Replay selecionado para esta apresentação.</p> : <>
      <h3>Dia {snapshot.day}</h3>
      <MetricList document={document} metrics={snapshot.metrics} />
      <FactList document={document} facts={snapshot.facts} />
    </>}
  </section>;
}
