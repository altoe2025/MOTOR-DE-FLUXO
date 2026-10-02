import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { formatMoney } from '../../presentation/format';
import type { OpenReplayOrder, ReplayDocument, ReplaySort, ReplayState } from '../domain';
import { presentReplayDay } from '../presentation';
import { replayStateAt, replayTransition, sortOpenOrders } from '../state';
import type { ReplayPlayback } from '../useReplayPlayback';
import { ReplayConnections, replayDayFlows } from './ReplayConnections';
import { ReplayOrderCard } from './ReplayOrderCard';

export type ReplayTransitionMode = 'ANIMATE' | 'INSTANT';

/** Etapas de um dia animado, em ms na velocidade 1×. */
export const REPLAY_TIMING = {
  move: 900,
  flowAt: 1_000,
  draw: 1_300,
  stagger: 300,
  leaveAt: 6_300,
  clearAt: 7_000,
} as const;

type Phase = 'IDLE' | 'MOVE' | 'FLOW' | 'SETTLED' | 'LEAVING';

function initialOrder(document: ReplayDocument, orderId: string): OpenReplayOrder | null {
  const order = document.orders.find((item) => item.id === orderId);
  if (order === undefined) return null;
  return {
    orderId: order.id, clientId: order.client_id, direction: order.direction, cohort: order.cohort,
    knownDay: order.known_day, deadlineDay: order.deadline_day,
    originalValueBrl: order.value_brl, openValueBrl: order.value_brl,
  };
}

function departingOrders(document: ReplayDocument, day: number): readonly OpenReplayOrder[] {
  const transitions = replayTransition(document, day - 1, day);
  const settled = new Set(transitions.filter((item) => item.kind === 'ORDER_SETTLED').map((item) => item.orderId));
  if (settled.size === 0) return [];
  const before = day === 0 ? [] : replayStateAt(document, day - 1).openOrders.filter((order) => settled.has(order.orderId));
  const beforeIds = new Set(before.map((order) => order.orderId));
  const sameDay = [...settled]
    .filter((orderId) => !beforeIds.has(orderId))
    .map((orderId) => initialOrder(document, orderId))
    .filter((order): order is OpenReplayOrder => order !== null);
  return [...before, ...sameDay];
}

/** Saldo de cada ordem antes do fechamento do dia: o de ontem, ou o valor cheio se chegou hoje. */
function openingValues(document: ReplayDocument, day: number): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  if (day > 0) for (const order of replayStateAt(document, day - 1).openOrders) values.set(order.orderId, order.openValueBrl);
  for (const order of document.orders) if (order.known_day === day) values.set(order.id, order.value_brl);
  return values;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ReplayStage({ document, state, sort, transitionMode, transitionKey, playback, companyOf, company = null, dateOf = null, frozen = false }: Readonly<{
  document: ReplayDocument;
  playback: Pick<ReplayPlayback, 'primaryAction' | 'playing' | 'togglePlaying'> & Partial<Pick<ReplayPlayback, 'speed'>>;
  companyOf?: (orderId: string) => string;
  /** Mostra só os cartões desta empresa; totais e linhas continuam da carteira toda. */
  company?: string | null;
  dateOf?: ((day: number) => string) | null;
  state: ReplayState;
  sort: ReplaySort;
  transitionMode: ReplayTransitionMode;
  transitionKey: number;
  frozen?: boolean;
}>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<Readonly<{ key: string; phase: Phase }>>({ key: '', phase: 'IDLE' });
  const [focusId, setFocusId] = useState<string | null>(null);
  const speed = playback.speed ?? 1;
  const view = presentReplayDay(document, state.day);
  const flows = useMemo(() => replayDayFlows(document, state.day), [document, state.day]);
  const animate = transitionMode === 'ANIMATE' && view.hasOperationalEvent && !reducedMotion();
  const hold = frozen && view.hasOperationalEvent;

  // A etapa sai do próprio render: o primeiro quadro de um dia animado já é MOVE,
  // com o saldo de abertura e as ordens que vão liquidar, sem piscar o estado final.
  const runKey = `${transitionKey}:${state.day}`;
  const phase: Phase = hold ? 'SETTLED' : !animate ? 'IDLE' : progress.key === runKey ? progress.phase : 'MOVE';
  const dayDeparting = useMemo(() => departingOrders(document, state.day), [document, state.day]);
  const departing = phase === 'IDLE' ? [] : dayDeparting;

  useEffect(() => {
    if (hold || !animate) return undefined;
    const set = (next: Phase) => setProgress({ key: runKey, phase: next });
    set('MOVE');
    const settleAt = REPLAY_TIMING.flowAt + REPLAY_TIMING.draw + REPLAY_TIMING.stagger * Math.max(0, flows.length - 1);
    const at = (ms: number, run: () => void) => globalThis.setTimeout(run, ms / speed);
    const timers = [
      at(REPLAY_TIMING.flowAt, () => set('FLOW')),
      at(settleAt, () => set('SETTLED')),
      at(REPLAY_TIMING.leaveAt, () => set('LEAVING')),
      at(REPLAY_TIMING.clearAt, () => set('IDLE')),
    ];
    return () => timers.forEach((timer) => globalThis.clearTimeout(timer));
    // speed fica de fora: mudar a velocidade no meio do dia não reinicia a animação.
  }, [animate, hold, runKey, flows.length]);

  const visible = useMemo(() => {
    const currentIds = new Set(state.openOrders.map((order) => order.orderId));
    const all = [...state.openOrders, ...departing.filter((order) => !currentIds.has(order.orderId))];
    return company === null || companyOf === undefined ? all : all.filter((order) => companyOf(order.orderId) === company);
  }, [company, companyOf, departing, state.openOrders]);
  const outOrders = sortOpenOrders(visible.filter((order) => order.direction === 'OUT'), sort);
  const inOrders = sortOpenOrders(visible.filter((order) => order.direction === 'IN'), sort);
  const departingIds = new Set(departing.map((order) => order.orderId));
  const opening = useMemo(() => openingValues(document, state.day), [document, state.day]);
  const beforeClosing = phase === 'MOVE' || phase === 'FLOW';
  const showFlows = phase === 'FLOW' || phase === 'SETTLED' || phase === 'LEAVING';
  const focusIds = useMemo(() => {
    if (focusId === null) return null;
    const ids = new Set([focusId]);
    for (const flow of flows) if (flow.from === focusId || flow.to === focusId) { ids.add(flow.from); ids.add(flow.to); }
    return ids;
  }, [flows, focusId]);

  // Cartões que mudam de lugar deslizam da posição antiga para a nova (FLIP).
  const layoutKey = `${transitionKey}:${state.day}:${sort}:${company ?? ''}:${visible.map((order) => order.orderId).join(',')}`;
  const rects = useRef(new Map<string, DOMRect>());
  // As setas medem as pontas pelo retângulo na tela; quando um deslize termina, medem de novo.
  const [settledMoves, setSettledMoves] = useState(0);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return undefined;
    const next = new Map<string, DOMRect>();
    const moves: Promise<unknown>[] = [];
    for (const element of stage.querySelectorAll<HTMLElement>('[data-order-id]')) {
      const orderId = element.dataset.orderId!;
      const rect = element.getBoundingClientRect();
      next.set(orderId, rect);
      const previous = rects.current.get(orderId);
      if (!animate || previous === undefined || typeof element.animate !== 'function') continue;
      const dx = previous.left - rect.left, dy = previous.top - rect.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      moves.push(element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: REPLAY_TIMING.move / speed, easing: 'cubic-bezier(.22,.8,.24,1)',
      }).finished.catch(() => undefined));
    }
    rects.current = next;
    if (moves.length === 0) return undefined;
    let current = true;
    void Promise.all(moves).then(() => { if (current) setSettledMoves((count) => count + 1); });
    return () => { current = false; };
  }, [layoutKey]);

  const onPointerOver = (event: MouseEvent<HTMLDivElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-order-id]');
    if (card !== null) setFocusId(card.dataset.orderId ?? null);
  };
  const onPointerOut = (event: MouseEvent<HTMLDivElement>) => {
    const leaving = (event.target as HTMLElement).closest('[data-order-id]');
    const entering = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-order-id]') : null;
    if (leaving !== null && leaving !== entering) setFocusId(null);
  };

  const card = (order: OpenReplayOrder) => {
    const isDeparting = departingIds.has(order.orderId);
    return <ReplayOrderCard
      key={order.orderId}
      order={order}
      {...(companyOf === undefined ? {} : { company: companyOf(order.orderId) })}
      valueBrl={beforeClosing ? (opening.get(order.orderId) ?? order.openValueBrl) : order.openValueBrl}
      settled={isDeparting && !beforeClosing}
      leaving={isDeparting && phase === 'LEAVING'}
      arriving={animate && order.knownDay === state.day}
      animateValue={animate}
      day={state.day}
      focused={focusIds?.has(order.orderId) ?? false}
      dateOf={dateOf}
    />;
  };
  const remitting = showFlows && flows.some((flow) => flow.kind === 'REMITTED');

  return <div className="replay-stage-shell">
    <div className="replay-stage-heading">
      <div><p className="eyebrow">Fluxo agregado</p><h2 id="replay-stage-heading">Cena Fronteira Viva</h2></div>
      <div className="replay-legend" aria-label="Legenda">
        <span><i className="legend-line legend-line--intra" />Autonetting intracliente</span>
        <span><i className="legend-line legend-line--inter" />Netting multilateral</span>
        <span><i className="legend-line legend-line--remitted" />Remetido — atravessa a fronteira</span>
      </div>
    </div>
    <div
      ref={stageRef}
      className={`replay-stage${animate ? ' replay-stage--animating' : ''}${hold ? ' replay-stage--frozen' : ''}${focusIds === null ? '' : ' replay-stage--focus'}`}
      role="region"
      aria-label="Cena Fronteira Viva"
      onMouseOver={onPointerOver}
      onMouseOut={onPointerOut}
    >
      <div className="replay-territory replay-territory--brasil"><span>Brasil</span><small>reais · OUT</small></div>
      <div className="replay-frontier">
        <span className="replay-frontier__label">CNR <small>fronteira</small></span>
        <span className="replay-frontier__phase">{state.phase === 'WARMUP' ? 'Aquecimento' : state.phase === 'MEASUREMENT' ? 'Medição' : 'Liquidação'}</span>
        <span className="replay-frontier__day">D{state.day}</span>
        <button className="replay-frontier__toggle" type="button" onClick={playback.togglePlaying} aria-pressed={playback.playing}
          aria-label={playback.primaryAction === 'RESTART' ? 'Recomeçar' : playback.playing ? 'Pausar' : 'Tocar'}>
          {playback.primaryAction === 'RESTART' ? '↺ Recomeçar' : playback.playing ? 'Ⅱ Pausar' : '▶ Tocar'}
        </button>
        <div className="replay-frontier__open"><small>Ainda aberto</small><strong>{formatMoney(view.openBrl)}</strong></div>
      </div>
      <div className="replay-territory replay-territory--exterior"><span>Exterior</span><small>moeda estrangeira · IN</small></div>
      <div className="replay-lane replay-lane--out" aria-label="Ordens OUT abertas">
        {outOrders.length === 0 ? <p className="replay-lane__empty">{company === null ? 'Sem OUT aberto' : `Sem OUT aberto de ${company}`}</p> : outOrders.map(card)}
      </div>
      <div className="replay-channel" data-replay-channel>
        <div className={`replay-gateway${remitting ? ' replay-gateway--live' : ''}`} data-replay-gateway>Remessa · câmbio</div>
      </div>
      <div className="replay-lane replay-lane--in" aria-label="Ordens IN abertas">
        {inOrders.length === 0 ? <p className="replay-lane__empty">{company === null ? 'Sem IN aberto' : `Sem IN aberto de ${company}`}</p> : inOrders.map(card)}
      </div>
      <ReplayConnections stageRef={stageRef} flows={flows} active={showFlows} fading={phase === 'LEAVING'}
        animate={animate} speed={speed} transitionKey={transitionKey} layoutKey={`${layoutKey}:${phase}:${settledMoves}`} focusIds={focusIds} />
    </div>
  </div>;
}
