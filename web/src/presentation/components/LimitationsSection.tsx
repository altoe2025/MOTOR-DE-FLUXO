import type { CommunicationDocumentV1 } from '../../communication/domain';
import { FactList } from './DocumentItems';

export function LimitationsSection({ document }: Readonly<{ document: CommunicationDocumentV1 }>) {
  return <section id="limitacoes" aria-labelledby="limitacoes-title" data-route-id="presentation" data-help-id="page.apresentacao">
    <h2 id="limitacoes-title">Limitações e versões</h2>
    {document.limitations.length === 0 ? <p>Nenhuma limitação publicada para esta execução.</p>
      : <ul>{document.limitations.map((item) => {
        const sourced = item.evidenceRefs.length > 0
          && item.evidenceRefs.every((ref) => Object.hasOwn(document.evidenceIndex, ref));
        return <li key={item.code}
        data-evidence-refs={item.evidenceRefs.join(' ')}
        data-source-ids={item.evidenceRefs.map((ref) => document.evidenceIndex[ref]?.sourceId ?? '').join(' ')}>
        {sourced ? <><strong>{item.severity === 'WARNING' ? 'Atenção' : 'Informação'}:</strong> {item.statement}</>
          : 'Referência de evidência ausente no documento.'}
      </li>;
      })}</ul>}
    <h3>Versões e reprodução</h3>
    <FactList document={document} facts={document.versions} />
    <p>Identificador do documento: <code>{document.contextFingerprint}</code></p>
  </section>;
}
