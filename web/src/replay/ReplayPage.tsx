import Decimal from 'decimal.js';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type { ReplayRequest } from '../api/client';
import { ApiError } from '../api/errors';
import { useDiagnosticRuntime } from '../app/providers';
import { formatFraction, formatMoney } from '../presentation/format';
import type { StudyDocument } from '../study/model';
import type { ReplayDocument, ReplaySort } from './domain';
import { replayStateAt, sortOpenOrders } from './state';
import { useReplayPlayback } from './useReplayPlayback';

export type ReplayPublicErrorCode =
  | 'REPLAY_NAO_DISPONIVEL'
  | 'EXECUCAO_NAO_ENCONTRADA'
  | 'EXECUCAO_NAO_TERMINAL'
  | 'REPETICAO_NAO_SELECIONADA'
  | 'REPLAY_INCONSISTENTE'
  | 'VERSAO_REPLAY_NAO_SUPORTADA';

type ReplayResolution =
  | Readonly<{ ok: true; request: ReplayRequest; scenarioId: string }>
  | Readonly<{ ok: false; code: ReplayPublicErrorCode; message: string }>;

const publicCodes = new Set<ReplayPublicErrorCode>([
  'REPLAY_NAO_DISPONIVEL', 'EXECUCAO_NAO_ENCONTRADA', 'EXECUCAO_NAO_TERMINAL',
  'REPETICAO_NAO_SELECIONADA', 'REPLAY_INCONSISTENTE', 'VERSAO_REPLAY_NAO_SUPORTADA',
]);

export function resolveReplayRequest(
  study: StudyDocument,
  ownerSub: string | null,
  executionId: string,
): ReplayResolution {
  if (ownerSub === null || study.ownerSub !== ownerSub) return {
    ok: false, code: 'EXECUCAO_NAO_ENCONTRADA', message: 'A execução não existe neste Estudo.',
  };
  const execution = study.executions.find((item) => item.id === executionId);
  if (execution?.kind !== 'DIAGNOSTIC') return {
    ok: false, code: 'EXECUCAO_NAO_ENCONTRADA', message: 'A execução não existe neste Estudo.',
  };
  if (execution.status !== 'SUCCEEDED') return {
    ok: false, code: 'EXECUCAO_NAO_TERMINAL', message: 'O diagnóstico precisa terminar antes de abrir o Replay.',
  };
  if (execution.envelope === null) return {
    ok: false, code: 'REPLAY_NAO_DISPONIVEL', message: 'A execução persistida não contém os dados necessários para o Replay.',
  };
  const repetitionId = execution.envelope.selected_execution.statistics.repetition_id;
  if (typeof repetitionId !== 'string' || repetitionId.length === 0) return {
    ok: false, code: 'REPETICAO_NAO_SELECIONADA', message: 'O diagnóstico não possui uma repetição de referência selecionada.',
  };
  if (!study.scenarios.some((scenario) => scenario.id === execution.scenarioId)) return {
    ok: false, code: 'REPLAY_INCONSISTENTE', message: 'A execução não reconcilia com os cenários persistidos no Estudo.',
  };
  return {
    ok: true,
    scenarioId: execution.scenarioId,
    request: {
      api_version: '1.0.0',
      diagnostic_execution_id: execution.id,
      diagnostic_envelope: structuredClone(execution.envelope) as unknown as ReplayRequest['diagnostic_envelope'],
    },
  };
}

type LoadState =
  | Readonly<{ kind: 'LOADING' }>
  | Readonly<{ kind: 'READY'; document: ReplayDocument; studyName: string; scenarioId: string }>
  | Readonly<{ kind: 'ERROR'; code: ReplayPublicErrorCode; message: string; retryable: boolean }>;

function errorState(reason: unknown): Extract<LoadState, { kind: 'ERROR' }> {
  if (reason instanceof ApiError) {
    const code = publicCodes.has(reason.code as ReplayPublicErrorCode)
      ? reason.code as ReplayPublicErrorCode
      : 'REPLAY_NAO_DISPONIVEL';
    return { kind: 'ERROR', code, message: reason.message, retryable: ['TRANSPORTE_INDISPONIVEL', 'TEMPO_ESGOTADO'].includes(reason.code) };
  }
  return { kind: 'ERROR', code: 'REPLAY_NAO_DISPONIVEL', message: 'Não foi possível abrir o Replay.', retryable: true };
}

export function ReplayPage() {
  const { studyId } = useParams();
  const [searchParams] = useSearchParams();
  const executionId = searchParams.get('executionId');
  const { ownerSub, controller, client } = useDiagnosticRuntime();
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'LOADING' });
  const [retryRevision, setRetryRevision] = useState(0);
  const identityToken = useRef(0);

  useEffect(() => {
    const token = ++identityToken.current;
    const abort = new AbortController();
    let active = true;
    setLoadState({ kind: 'LOADING' });
    if (studyId === undefined || executionId === null) {
      setLoadState({ kind: 'ERROR', code: 'EXECUCAO_NAO_ENCONTRADA', message: 'Informe uma execução válida na URL do Replay.', retryable: false });
      return () => { active = false; abort.abort(); };
    }
    void controller.loadStudy(studyId).then(async (study) => {
      if (!active || token !== identityToken.current) return;
      if (study === null) {
        setLoadState({ kind: 'ERROR', code: 'EXECUCAO_NAO_ENCONTRADA', message: 'O Estudo ou a execução não foi encontrado.', retryable: false });
        return;
      }
      const resolution = resolveReplayRequest(study, ownerSub, executionId);
      if (!resolution.ok) {
        setLoadState({ kind: 'ERROR', code: resolution.code, message: resolution.message, retryable: false });
        return;
      }
      try {
        const document = await client.buildReplay(resolution.request, abort.signal);
        if (active && token === identityToken.current) {
          setLoadState({ kind: 'READY', document, studyName: study.name, scenarioId: resolution.scenarioId });
        }
      } catch (reason) {
        if (active && token === identityToken.current && !abort.signal.aborted) setLoadState(errorState(reason));
      }
    }).catch((reason: unknown) => {
      if (active && token === identityToken.current) setLoadState(errorState(reason));
    });
    return () => { active = false; abort.abort(); };
  }, [client, controller, executionId, ownerSub, retryRevision, studyId]);

  if (loadState.kind === 'LOADING') return <p role="status">Reconstruindo Replay…</p>;
  if (loadState.kind === 'ERROR') return <ReplayError state={loadState} studyId={studyId} onRetry={() => setRetryRevision((value) => value + 1)} />;
  return <ReplayReady document={loadState.document} studyName={loadState.studyName} studyId={studyId!} scenarioId={loadState.scenarioId} />;
}

function ReplayError({ state, studyId, onRetry }: Readonly<{
  state: Extract<LoadState, { kind: 'ERROR' }>;
  studyId: string | undefined;
  onRetry(): void;
}>) {
  return <article className="replay-page replay-error">
    <p className="eyebrow">Replay indisponível</p>
    <h1 tabIndex={-1}>Não foi possível abrir a Fronteira Viva</h1>
    <p><code>{state.code}</code></p>
    <p>{state.message}</p>
    <div className="replay-error-actions">
      {state.retryable ? <button type="button" onClick={onRetry}>Tentar novamente</button> : null}
      <Link to={studyId === undefined ? '/estudos' : `/estudos/${studyId}/diagnostico`}>Voltar ao diagnóstico</Link>
    </div>
  </article>;
}

function ReplayReady({ document, studyName, studyId, scenarioId }: Readonly<{
  document: ReplayDocument;
  studyName: string;
  studyId: string;
  scenarioId: string;
}>) {
  const playback = useReplayPlayback(document);
  const [sort, setSort] = useState<ReplaySort>('ARRIVAL');
  const state = replayStateAt(document, playback.day);
  const openOrders = sortOpenOrders(state.openOrders, sort);
  const remitted = new Decimal(state.endState.remitted_out_accumulated_brl).plus(state.endState.remitted_in_accumulated_brl).toFixed();
  const directDay = `Dia ${playback.day} de ${document.period.settlement_end_day}`;
  return <article className="replay-page">
    <header className="replay-titlebar">
      <div><p className="eyebrow">{studyName}</p><h1 tabIndex={-1}>Fronteira Viva</h1>
        <p className="page-introduction">Replay determinístico da repetição selecionada · política {document.policy}</p></div>
      <Link to={`/estudos/${studyId}/diagnostico?scenarioId=${encodeURIComponent(scenarioId)}`}>Voltar ao diagnóstico</Link>
    </header>
    <section aria-label="Controles do Replay" className="replay-controls">
      <button type="button" onClick={playback.togglePlaying} aria-pressed={playback.playing}>
        {playback.primaryAction === 'RESTART' ? 'Recomeçar' : playback.playing ? 'Pausar' : 'Tocar'}
      </button>
      {([1, 2, 4] as const).map((speed) => <button type="button" key={speed} aria-pressed={playback.speed === speed} onClick={() => playback.setSpeed(speed)}>{speed}×</button>)}
      <button type="button" onClick={playback.previous} disabled={playback.day === 0}>Dia anterior</button>
      <button type="button" onClick={playback.next} disabled={playback.day === document.period.settlement_end_day}>Dia seguinte</button>
      <button type="button" onClick={playback.nextClosing}>Próximo fechamento</button>
      <button type="button" onClick={playback.repeat}>Repetir evento</button>
      <label>Dia <input aria-label="Selecionar dia" type="range" min={0} max={document.period.settlement_end_day} value={playback.day} onChange={(event) => playback.selectDay(Number(event.currentTarget.value))} /></label>
    </section>
    <p className="replay-live" aria-live="polite">{directDay} · {state.phase}</p>
    <section className="replay-metrics" aria-label="Acumulados do Replay">
      <div><span>Casado</span><strong>{formatMoney(state.endState.measured_matched_contribution_accumulated_brl)}</strong></div>
      <div><span>Remetido total</span><strong>{formatMoney(remitted)}</strong></div>
      <div><span>Netabilidade</span><strong>{formatFraction(document.totals.netability_fraction)}</strong></div>
    </section>
    <section aria-label="Estado do dia">
      <h2>{directDay}</h2>
      <p>{openOrders.length} {openOrders.length === 1 ? 'ordem aberta' : 'ordens abertas'}.</p>
      <div><button type="button" aria-pressed={sort === 'ARRIVAL'} onClick={() => setSort('ARRIVAL')}>Chegada</button><button type="button" aria-pressed={sort === 'EDF'} onClick={() => setSort('EDF')}>EDF</button></div>
      <ul>{openOrders.map((order) => <li key={order.orderId}>{order.direction} · {order.orderId} · {formatMoney(order.openValueBrl)} · prazo D{order.deadlineDay}</li>)}</ul>
    </section>
  </article>;
}
