import type { CommunicationDocumentV1 } from '../../communication/domain';
import { FactList } from './DocumentItems';

export function AssumptionsSection({ document }: Readonly<{ document: CommunicationDocumentV1 }>) {
  return <section id="premissas" aria-labelledby="premissas-title" data-route-id="presentation" data-help-id="page.apresentacao">
    <h2 id="premissas-title">Premissas e proveniência</h2>
    <h3>Premissas publicadas</h3>
    <FactList document={document} facts={document.assumptions} />
    <h3>Proveniência</h3>
    <FactList document={document} facts={document.provenance} />
  </section>;
}
