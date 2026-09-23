import { useEffect, useMemo, useRef, useState } from 'react';

import { formatMoney } from '../../presentation/format';
import type { OpenReplayOrder, ReplayDocument, ReplaySort, ReplayState } from '../domain';
import { presentReplayDay } from '../presentation';
import { replayStateAt, replayTransition, sortOpenOrders } from '../state';
import { ReplayConnections } from './ReplayConnections';
import { ReplayOrderCard } from './ReplayOrderCard';

export type ReplayTransitionMode = 'ANIMATE' | 'INSTANT';

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

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const triggerLabels = { WINDOW: 'janela', DEADLINE: 'prazo', HORIZON_END: 'fim do horizonte' } as const;

export function ReplayStage({ document, state, sort, transitionMode, transitionKey }: Readonly<{
  document: ReplayDocument;
  state: ReplayState;
  sort: ReplaySort;
  transitionMode: ReplayTransitionMode;
  transitionKey: number;
}>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [departing, setDeparting] = useState<readonly OpenReplayOrder[]>([]);
  const [eventActive, setEventActive] = useState(false);
  const view = presentReplayDay(document, state.day);
  const animate = transitionMode === 'ANIMATE' && view.hasOperationalEvent && !reducedMotion();

  useEffect(() => {
    if (!animate) {
      setDeparting([]);
      setEventActive(false);
      return undefined;
    }
    setEventActive(true);
    setDeparting(departingOrders(document, state.day));
    const timeout = globalThis.setTimeout(() => {
      setDeparting([]);
      setEventActive(false);
    }, 2_600);
    return () => globalThis.clearTimeout(timeout);
  }, [animate, document, state.day, transitionKey]);

  const visible = useMemo(() => {
    const currentIds = new Set(state.openOrders.map((order) => order.orderId));
    return [...state.openOrders, ...departing.filter((order) => !currentIds.has(order.orderId))];
  }, [departing, state.openOrders]);
  const outOrders = sortOpenOrders(visible.filter((order) => order.direction === 'OUT'), sort);
  const inOrders = sortOpenOrders(visible.filter((order) => order.direction === 'IN'), sort);
  const departingIds = new Set(departing.map((order) => order.orderId));

  return <div className="replay-stage-shell">
    <div className="replay-stage-heading">
      <div><p className="eyebrow">Fluxo agregado</p><h2 id="replay-stage-heading">Cena Fronteira Viva</h2></div>
      <div className="replay-legend" aria-label="Legenda">
        <span><i className="legend-line legend-line--intra" />Autonetting intracliente</span>
        <span><i className="legend-line legend-line--inter" />Netting multilateral</span>
        <span><i className="legend-line legend-line--remitted" />Remetido — atravessa a fronteira</span>
      </div>
    </div>
    <div ref={stageRef} className={`replay-stage${animate ? ' replay-stage--animating' : ''}`} role="region" aria-label="Cena Fronteira Viva">
      <div className="replay-territory replay-territory--brasil"><span>Brasil</span><small>reais</small></div>
      <div className="replay-territory replay-territory--cnr"><span>CNR</span><small>fronteira</small></div>
      <div className="replay-territory replay-territory--exterior"><span>Exterior</span><small>moeda estrangeira</small></div>
      <div className="replay-lane replay-lane--out" aria-label="Ordens OUT abertas">
        {outOrders.length === 0 ? <p className="replay-lane__empty">Sem OUT aberto</p> : outOrders.map((order) => <ReplayOrderCard key={order.orderId} order={order} departing={departingIds.has(order.orderId)} />)}
      </div>
      <div className="replay-frontier">
        <span className="replay-frontier__day">D{state.day}</span>
        <span className="replay-frontier__phase">{state.phase === 'WARMUP' ? 'Aquecimento' : state.phase === 'MEASUREMENT' ? 'Medição' : 'Liquidação'}</span>
        <div><small>Casado no dia</small><strong>{formatMoney(view.matchedContributionBrl)}</strong></div>
        <div><small>Ainda aberto</small><strong>{formatMoney(view.openBrl)}</strong></div>
        {state.closing === null ? <span className="replay-frontier__status">Sem fechamento</span> : <span className="replay-frontier__status">Fechamento · {state.closing.triggers.map((trigger) => triggerLabels[trigger]).join(' + ')}</span>}
      </div>
      <div className="replay-lane replay-lane--in" aria-label="Ordens IN abertas">
        {inOrders.length === 0 ? <p className="replay-lane__empty">Sem IN aberto</p> : inOrders.map((order) => <ReplayOrderCard key={order.orderId} order={order} departing={departingIds.has(order.orderId)} />)}
      </div>
      <ReplayConnections stageRef={stageRef} document={document} day={state.day} active={eventActive} transitionKey={transitionKey} />
    </div>
  </div>;
}
