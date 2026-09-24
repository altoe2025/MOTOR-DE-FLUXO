import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import { useDiagnosticRuntime } from '../app/providers';
import { useOptionalChat } from '../chat/ChatProvider';
import { selectionId } from '../chat/routeContext';
import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import type { CommunicationDocumentV1 } from '../communication/domain';
import { HELP_IDS } from '../help/helpIds';
import { PresentationPage } from './PresentationPage';
import { resolvePresentationSelection } from './selection';
import type { PresentationSectionId } from './domain';

type LoadState = Readonly<{ identity: string; kind: 'loading' }>
  | Readonly<{ identity: string; kind: 'invalid'; message: string }>
  | Readonly<{ identity: string; kind: 'error'; message: string }>
  | Readonly<{ identity: string; kind: 'ready'; document: CommunicationDocumentV1; scenarioName: string }>;

const sectionHelp: Readonly<Record<PresentationSectionId, string>> = {
  resumo: HELP_IDS.PRESENTATION_PAGE,
  composicao: HELP_IDS.COMPOSITION,
  comparacao: HELP_IDS.COMPARISON_PAGE,
  replay: HELP_IDS.REPLAY,
  premissas: HELP_IDS.PRESENTATION_PAGE,
  limitacoes: HELP_IDS.PRESENTATION_PAGE,
};

export function PresentationRoute() {
  const { studyId } = useParams();
  const [params] = useSearchParams();
  const scenarioId = selectionId(params.get('cenario'));
  const executionId = selectionId(params.get('execucao'));
  const { ownerSub, controller } = useDiagnosticRuntime();
  const chat = useOptionalChat();
  const publishCommunication = chat?.publishCommunication;
  const setScenarioId = chat?.setScenarioId;
  const setExecutionId = chat?.setDiagnosticExecutionId;
  const setHelpId = chat?.setHelpId;
  const location = useLocation();
  const identity = JSON.stringify([ownerSub, studyId, params.toString()]);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ identity, kind: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ identity, kind: 'loading' });
    publishCommunication?.(null);
    setScenarioId?.(scenarioId);
    setExecutionId?.(executionId);
    if (studyId === undefined) return () => { active = false; };
    void controller.loadStudy(studyId).then(async (study) => {
      if (!active) return;
      const resolved = resolvePresentationSelection(study, ownerSub, scenarioId, executionId);
      if (!resolved.ok) { setState({ identity, kind: 'invalid', message: resolved.reason }); return; }
      const document = await buildCommunicationDocument(resolved.input);
      if (!active) return;
      setState({ identity, kind: 'ready', document,
        scenarioName: study!.scenarios.find((item) => item.id === scenarioId)!.name });
      publishCommunication?.(resolved.input);
    }).catch(() => {
      if (active) setState({ identity, kind: 'error', message: 'Não foi possível abrir o documento de comunicação.' });
    });
    return () => { active = false; publishCommunication?.(null); };
  }, [controller, executionId, identity, ownerSub, publishCommunication, retry, scenarioId, setExecutionId, setScenarioId, studyId]);

  useEffect(() => {
    const section = location.hash.slice(1) as PresentationSectionId;
    setHelpId?.(Object.hasOwn(sectionHelp, section) ? sectionHelp[section] : HELP_IDS.PRESENTATION_PAGE);
    if (state.identity === identity && state.kind === 'ready' && Object.hasOwn(sectionHelp, section)) {
      document.getElementById(section)?.scrollIntoView?.({ block: 'start' });
    }
  }, [identity, location.hash, setHelpId, state]);

  if (state.identity !== identity || state.kind === 'loading') return <PresentationPage state={{ kind: 'loading' }} />;
  if (state.kind === 'invalid') return <article className="presentation-page"><h1>Apresentação</h1>
    <p role="alert">{state.message}</p><Link to={`/carteira/${studyId ?? ''}`}>Selecionar no Estudo</Link></article>;
  if (state.kind === 'error') return <PresentationPage state={{ kind: 'error', message: state.message,
    onRetry: () => setRetry((value) => value + 1) }} />;
  return <><nav className="presentation-return" aria-label="Retorno da apresentação">
    <Link to={`/estudos/${studyId}/diagnostico?scenarioId=${encodeURIComponent(scenarioId!)}&executionId=${encodeURIComponent(executionId!)}`}>
      Voltar ao diagnóstico
    </Link>
  </nav><PresentationPage state={{ kind: 'ready', document: state.document, scenarioName: state.scenarioName, selection: {
    studyId: studyId!, scenarioId: scenarioId!, diagnosticExecutionId: executionId!,
  } }} /></>;
}
