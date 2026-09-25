import type { CommunicationDocumentV1 } from '../communication/domain';

export function PrintMetadata({ document, scenarioName, buildSha }: Readonly<{
  document: CommunicationDocumentV1;
  scenarioName: string;
  buildSha: string;
}>) {
  const publicSha = /^[0-9a-f]{7,40}$/i.test(buildSha) ? buildSha : 'indisponível';
  return <footer className="print-metadata" aria-label="Metadados da publicação">
    <h2>Identificação do relatório</h2>
    <dl>
      <div><dt>Estudo</dt><dd>{document.study.name}</dd></div>
      <div><dt>Cenário</dt><dd>{scenarioName} · {document.selection.scenarioId}</dd></div>
      <div><dt>Execução</dt><dd>{document.selection.diagnosticExecutionId}</dd></div>
      <div><dt>Gerado em</dt><dd>{document.generatedAt}</dd></div>
      <div><dt>Versão do documento</dt><dd>{document.presentationVersion}</dd></div>
      <div><dt>Build</dt><dd>{publicSha}</dd></div>
    </dl>
  </footer>;
}
