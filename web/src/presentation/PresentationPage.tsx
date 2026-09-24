import type { CommunicationDocumentV1 } from '../communication/domain';
import { AssumptionsSection } from './components/AssumptionsSection';
import { ComparisonSection } from './components/ComparisonSection';
import { CompositionSection } from './components/CompositionSection';
import { ExecutiveSummary } from './components/ExecutiveSummary';
import { LimitationsSection } from './components/LimitationsSection';
import { PresentationHeader } from './components/PresentationHeader';
import { ReplayHighlightsSection } from './components/ReplayHighlightsSection';
import { matchesPresentationSelection, type PresentationSelection } from './domain';

export type PresentationPageState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'missing'; onRegenerate: () => void }>
  | Readonly<{ kind: 'error'; message: string; onRetry: () => void }>
  | Readonly<{ kind: 'ready'; document: CommunicationDocumentV1; selection: PresentationSelection; scenarioName?: string }>;

export function PresentationPage({ state }: Readonly<{ state: PresentationPageState }>) {
  if (state.kind === 'loading') return <article className="presentation-page" aria-busy="true">
    <h1>Apresentação</h1><div role="status">Carregando documento de comunicação…</div>
  </article>;
  if (state.kind === 'missing') return <article className="presentation-page">
    <h1>Apresentação</h1><p role="alert">Documento ausente para a seleção atual.</p>
    <button type="button" onClick={state.onRegenerate}>Regenerar documento</button>
  </article>;
  if (state.kind === 'error') return <article className="presentation-page">
    <h1>Apresentação</h1><p role="alert">{state.message}</p>
    <button type="button" onClick={state.onRetry}>Tentar novamente</button>
  </article>;
  if (!matchesPresentationSelection(state.document, state.selection)) return <article className="presentation-page">
    <h1>Apresentação</h1><p role="alert">O documento não corresponde à seleção atual. Volte ao Estudo e selecione a execução novamente.</p>
  </article>;
  const { document } = state;
  return <article className="presentation-page">
    <PresentationHeader document={document} />
    <ExecutiveSummary document={document} />
    <CompositionSection document={document} />
    <ComparisonSection document={document} />
    <ReplayHighlightsSection document={document} />
    <AssumptionsSection document={document} />
    <LimitationsSection document={document} />
  </article>;
}
