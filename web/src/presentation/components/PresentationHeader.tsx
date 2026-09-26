import type { CommunicationDocumentV1 } from '../../communication/domain';

function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match === null ? iso : `${match[3]}/${match[2]}/${match[1]}`;
}

export function PresentationHeader({ document, scenarioName }: Readonly<{
  document: CommunicationDocumentV1;
  scenarioName?: string | undefined;
}>) {
  const family = document.source.family === 'OBSERVED' ? 'Caso observado' : 'Simulação por Perfil';
  return <header className="presentation-header" data-help-id="page.apresentacao">
    <p className="eyebrow">Apresentação</p>
    <h1>{document.study.name}</h1>
    <p className="presentation-header__meta">
      {family}{scenarioName === undefined ? null : <> · {scenarioName}</>}
      {' · '}<time dateTime={document.generatedAt}>{formatDate(document.generatedAt)}</time>
    </p>
    <p className="presentation-header__note">{document.source.synthetic
      ? 'Hipótese sintética não calibrada; valores simulados sob as premissas informadas.'
      : 'Resultado simulado sob as premissas informadas.'}</p>
  </header>;
}
