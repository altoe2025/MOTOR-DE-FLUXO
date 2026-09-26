import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import { useDiagnosticRuntime } from '../app/providers';
import { useOptionalChat } from '../chat/ChatProvider';
import { selectionId } from '../chat/routeContext';
import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import type { CommunicationDocumentV1 } from '../communication/domain';
import { HELP_IDS } from '../help/helpIds';
import { resolveReplayRequest } from '../replay/ReplayPage';
import { PresentationPage } from './PresentationPage';
import { presentationParticipantNames } from './participants';
import { resolvePresentationSelection } from './selection';
import type { PresentationSectionId } from './domain';

type LoadState = Readonly<{ identity: string; kind: 'loading' }>
  | Readonly<{ identity: string; kind: 'invalid'; message: string }>
  | Readonly<{ identity: string; kind: 'error'; message: string }>
  | Readonly<{ identity: string; kind: 'ready'; document: CommunicationDocumentV1; scenarioName: string;
      participantNames: Readonly<Record<string, string>> }>;

const sectionHelp: Readonly<Record<PresentationSectionId, string>> = {
  resumo: HELP_IDS.PRESENTATION_PAGE,
  composicao: HELP_IDS.COMPOSITION,
};

export function PresentationRoute() {
  const { studyId } = useParams();
  const [params] = useSearchParams();
  const scenarioId = selectionId(params.get('cenario'));
  const executionId = selectionId(params.get('execucao'));
  const comparisonText = params.get('comparacao');
  const comparisonExecutionId = comparisonText === null ? null : selectionId(comparisonText);
  const dayText = params.get('dia');
  const replayDay = dayText === null ? null : /^(0|[1-9]\d*)$/.test(dayText) ? Number(dayText) : Number.NaN;
  const { ownerSub, controller, client } = useDiagnosticRuntime();
  const chat = useOptionalChat();
  const publishCommunication = chat?.publishCommunication;
  const setScenarioId = chat?.setScenarioId;
  const setExecutionId = chat?.setDiagnosticExecutionId;
  const setComparisonId = chat?.setComparisonExecutionId;
  const setHelpId = chat?.setHelpId;
  const location = useLocation();
  const identity = JSON.stringify([ownerSub, studyId, params.toString()]);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ identity, kind: 'loading' });

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setState({ identity, kind: 'loading' });
    publishCommunication?.(null);
    setScenarioId?.(scenarioId);
    setExecutionId?.(executionId);
    setComparisonId?.(comparisonExecutionId);
    if (studyId === undefined) return () => { active = false; abort.abort(); };
    void controller.loadStudy(studyId).then(async (study) => {
      if (!active) return;
      if ((comparisonText !== null && comparisonExecutionId === null)
        || (dayText !== null && !Number.isSafeInteger(replayDay))) {
        setState({ identity, kind: 'invalid', message: 'A seleção de comparação ou Replay na URL é inválida.' }); return;
      }
      const resolved = resolvePresentationSelection(study, ownerSub, scenarioId, executionId,
        { comparisonExecutionId, replayDay });
      if (!resolved.ok) { setState({ identity, kind: 'invalid', message: resolved.reason }); return; }
      let input = resolved.input;
      if (replayDay !== null) {
        const replayRequest = resolveReplayRequest(study!, ownerSub, executionId!);
        if (!replayRequest.ok || replayRequest.scenarioId !== scenarioId) {
          setState({ identity, kind: 'invalid', message: 'O Replay não corresponde à execução selecionada.' }); return;
        }
        const execution = study!.executions.find((item) => item.id === executionId)!;
        if (execution.kind !== 'DIAGNOSTIC') throw new Error('Execução diagnóstica ausente.');
        const replay = await client.buildReplay(replayRequest.request, abort.signal);
        input = { ...input, replay };
      }
      const document = await buildCommunicationDocument(input);
      const names = await presentationParticipantNames(study!, executionId!, controller).catch(() => ({}));
      if (!active) return;
      setState({ identity, kind: 'ready', document, participantNames: names,
        scenarioName: study!.scenarios.find((item) => item.id === scenarioId)!.name });
      publishCommunication?.(input, document);
    }).catch(() => {
      if (active) setState({ identity, kind: 'error', message: 'Não foi possível abrir o documento de comunicação.' });
    });
    return () => { active = false; abort.abort(); publishCommunication?.(null); };
  }, [client, comparisonExecutionId, comparisonText, controller, dayText, executionId, identity, ownerSub,
    publishCommunication, replayDay, retry, scenarioId, setComparisonId, setExecutionId, setScenarioId, studyId]);

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
  </nav><PresentationPage state={{ kind: 'ready', document: state.document, scenarioName: state.scenarioName,
    participantNames: state.participantNames, selection: {
    studyId: studyId!, scenarioId: scenarioId!, diagnosticExecutionId: executionId!,
    comparisonExecutionId, replayDay,
  } }} /></>;
}
