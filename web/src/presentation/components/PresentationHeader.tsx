import type { CommunicationDocumentV1 } from '../../communication/domain';
import type { PresentationSectionId } from '../domain';

const sections: readonly Readonly<{ id: PresentationSectionId; label: string }>[] = [
  { id: 'resumo', label: 'Resumo' }, { id: 'composicao', label: 'Composição' },
  { id: 'comparacao', label: 'Comparação' }, { id: 'replay', label: 'Replay' },
  { id: 'premissas', label: 'Premissas' }, { id: 'limitacoes', label: 'Limitações' },
];

export function PresentationHeader({ document }: Readonly<{ document: CommunicationDocumentV1 }>) {
  return <header className="presentation-header" data-help-id="page.apresentacao">
    <p className="eyebrow">Painel A · Apresentação</p>
    <h1>{document.study.name}</h1>
    <p>{document.source.family === 'OBSERVED' ? 'Caso observado' : 'Simulação sintética'}</p>
    <p>{document.source.label}</p>
    <dl>
      <div><dt>Estudo</dt><dd>{document.study.id}</dd></div>
      <div><dt>Cenário</dt><dd>{document.selection.scenarioId} · revisão {document.selection.scenarioRevision}</dd></div>
      <div><dt>Execução diagnóstica</dt><dd>{document.selection.diagnosticExecutionId}</dd></div>
      <div><dt>Repetição selecionada</dt><dd>{document.selection.repetitionId}</dd></div>
      <div><dt>Gerado em</dt><dd><time dateTime={document.generatedAt}>{document.generatedAt}</time></dd></div>
    </dl>
    <nav aria-label="Seções da apresentação"><ul>{sections.map(({ id, label }) =>
      <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ul></nav>
  </header>;
}
