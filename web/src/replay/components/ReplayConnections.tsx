import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

import { formatMoney } from '../../presentation/format';
import type { ReplayDocument } from '../domain';
import { anchoredCurve, remittanceCurve, type Box, type Point } from '../geometry';
import { GATEWAY, labelAnchor, placeLabels, routeFlows } from '../routing';

type MatchingOrigin = 'INTRA_CLIENTE' | 'INTER_CLIENTE';

export type ReplayDayFlow = Readonly<{
  id: string;
  from: string;
  /** Ordem IN de destino, ou GATEWAY quando o saldo é remetido. */
  to: string;
  kind: 'MATCHED' | 'REMITTED';
  valueBrl: string;
  matchingOrigin?: MatchingOrigin;
  direction?: 'OUT' | 'IN';
}>;

/** Fluxos desenhados no dia: casamentos OUT→IN e remessas de cada ordem até o portão de câmbio. */
export function replayDayFlows(document: ReplayDocument, day: number): readonly ReplayDayFlow[] {
  const replayDay = document.days[day];
  if (replayDay === undefined) return [];
  const flows: ReplayDayFlow[] = (replayDay.closing?.flow_segments ?? []).map((segment, index) => ({
    id: `matched-${index}-${segment.out_order_id}-${segment.in_order_id}`,
    from: segment.out_order_id, to: segment.in_order_id, kind: 'MATCHED',
    valueBrl: segment.value_brl, matchingOrigin: segment.matching_origin,
  }));
  for (const event of replayDay.events) {
    if (event.kind !== 'ALLOCATION' || event.allocation_type !== 'REMETIDO') continue;
    flows.push({
      id: `remitted-${event.sequence}-${event.order_id}`,
      from: event.order_id, to: GATEWAY, kind: 'REMITTED', valueBrl: event.value_brl, direction: event.direction,
    });
  }
  return flows;
}

type Drawn = Readonly<{ flow: ReplayDayFlow; path: string; label: (Point & { width: number }) | null }>;

const STAGGER_MS = 300;
const DRAW_MS = 1_300;
const DOT_CYCLE_MS = 2_800;

function box(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function labelWidth(text: string): number {
  return Math.round(text.length * 6.6 + 18);
}

function isStacked(stage: Box, card: Box): boolean {
  return stage.width > 0 && card.width >= stage.width * 0.75;
}

export function ReplayConnections({ stageRef, flows, active, fading, animate, speed, transitionKey, layoutKey, focusIds }: Readonly<{
  stageRef: RefObject<HTMLDivElement | null>;
  /** Muda quando os cartões visíveis mudam; força medir de novo as pontas. */
  layoutKey: string;
  flows: readonly ReplayDayFlow[];
  active: boolean;
  fading: boolean;
  animate: boolean;
  speed: number;
  transitionKey: number;
  focusIds: ReadonlySet<string> | null;
}>) {
  const [drawn, setDrawn] = useState<readonly Drawn[]>([]);
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (stage === null || !active) {
      setDrawn([]);
      return;
    }
    const stageBox = box(stage.getBoundingClientRect());
    const cards = new Map<string, Box>();
    for (const element of stage.querySelectorAll<HTMLElement>('[data-order-id]')) {
      const orderId = element.dataset.orderId;
      if (orderId !== undefined) cards.set(orderId, box(element.getBoundingClientRect()));
    }
    const channelElement = stage.querySelector<HTMLElement>('[data-replay-channel]');
    const gatewayElement = stage.querySelector<HTMLElement>('[data-replay-gateway]');
    const visible = flows.filter((flow) => cards.has(flow.from) && (flow.to === GATEWAY || cards.has(flow.to)));
    const byId = new Map(visible.map((flow) => [flow.id, flow]));

    // Empilhado (celular): mantém as curvas verticais simples de antes.
    if (channelElement === null || [...cards.values()].some((card) => isStacked(stageBox, card))) {
      setDrawn(visible.map((flow) => {
        const from = cards.get(flow.from)!;
        const curve = flow.to === GATEWAY
          ? remittanceCurve(stageBox, from, flow.direction ?? 'OUT')
          : anchoredCurve(stageBox, from, cards.get(flow.to)!);
        // Sem rótulo: no empilhado a seta atravessa o painel da CNR, e o valor está no diário.
        return { flow, path: curve.path, label: null };
      }));
      return;
    }

    const routed = routeFlows({
      stage: stageBox,
      channel: box(channelElement.getBoundingClientRect()),
      gateway: gatewayElement === null ? null : box(gatewayElement.getBoundingClientRect()),
      cards,
      flows: visible.map(({ id, from, to }) => ({ id, from, to })),
    });
    const labels = placeLabels(routed.map((route) => {
      const width = labelWidth(formatMoney(byId.get(route.id)!.valueBrl));
      return { id: route.id, ...labelAnchor(route, width), width };
    }));
    const labelById = new Map(labels.map((label) => [label.id, label]));
    setDrawn(routed.map((route) => ({ flow: byId.get(route.id)!, path: route.path, label: labelById.get(route.id)! })));
  }, [active, flows, stageRef]);

  useLayoutEffect(() => {
    measure();
    const stage = stageRef.current;
    if (stage === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    for (const card of stage.querySelectorAll<HTMLElement>('[data-order-id]')) observer.observe(card);
    return () => observer.disconnect();
  }, [layoutKey, measure, stageRef, transitionKey]);

  if (!active || drawn.length === 0) return null;
  const pathId = (flow: ReplayDayFlow) => `replay-flow-${transitionKey}-${flow.id}`.replace(/[^\w-]/g, '_');
  const tone = (flow: ReplayDayFlow) => flow.kind === 'REMITTED' ? 'remitted' : flow.matchingOrigin === 'INTRA_CLIENTE' ? 'intra' : 'inter';
  const focused = (flow: ReplayDayFlow) => focusIds !== null && focusIds.has(flow.from) && (flow.to === GATEWAY || focusIds.has(flow.to));
  const timing = (index: number): CSSProperties => ({
    ['--replay-draw-delay' as string]: `${animate ? index * STAGGER_MS / speed : 0}ms`,
    ['--replay-draw-ms' as string]: `${animate ? DRAW_MS / speed : 0}ms`,
  });
  const largest = Math.max(...drawn.map(({ flow }) => Number(flow.valueBrl) || 0), 1);

  return <>
    <svg className={`replay-connections${fading ? ' replay-connections--fading' : ''}`} aria-hidden="true" focusable="false">
      <defs>
        {(['intra', 'inter', 'remitted'] as const).map((name) => <marker key={name} id={`replay-arrow-${name}`} viewBox="0 0 10 10" markerWidth="7" markerHeight="7" refX="8" refY="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>)}
      </defs>
      {drawn.map(({ flow, path }, index) => {
        const originClass = flow.matchingOrigin === 'INTRA_CLIENTE'
          ? ' replay-connection--intra-client'
          : flow.matchingOrigin === 'INTER_CLIENTE' ? ' replay-connection--inter-client' : '';
        const dots = Math.max(2, Math.round(2 + 3 * (Number(flow.valueBrl) || 0) / largest));
        const firstDot = (animate ? (index * STAGGER_MS + DRAW_MS) / speed : 0) / 1_000;
        return <g key={pathId(flow)} className={`replay-flow replay-flow--${tone(flow)}${focused(flow) ? ' is-focus' : ''}`} style={timing(index)}>
          <path
            id={pathId(flow)}
            d={path}
            pathLength={1}
            className={`replay-connection replay-connection--${flow.kind.toLowerCase()}${originClass}${flow.direction === undefined ? '' : ` replay-connection--${flow.direction.toLowerCase()}`}${focused(flow) ? ' is-focus' : ''}`}
            markerEnd={`url(#replay-arrow-${tone(flow)})`}
          />
          {Array.from({ length: dots }, (_, dot) => <circle key={dot} className="replay-flow__dot" r="2.6">
            <animateMotion dur={`${DOT_CYCLE_MS / speed / 1_000}s`} begin={`${firstDot + dot * DOT_CYCLE_MS / dots / speed / 1_000}s`} repeatCount="indefinite">
              <mpath href={`#${pathId(flow)}`} />
            </animateMotion>
          </circle>)}
        </g>;
      })}
    </svg>
    <svg className={`replay-connection-labels${fading ? ' replay-connections--fading' : ''}`} aria-hidden="true" focusable="false">
      {drawn.map(({ flow, label }, index) => label === null ? null : <g
        key={`${pathId(flow)}-label`}
        className={`replay-connection-label replay-connection-label--${tone(flow)}${focused(flow) ? ' is-focus' : ''}`}
        transform={`translate(${Math.round(label.x)} ${Math.round(label.y)})`}
        style={timing(index)}
      >
        <rect x={-label.width / 2} y="-11" width={label.width} height="22" rx="5" />
        <text textAnchor="middle" dominantBaseline="central">{formatMoney(flow.valueBrl)}</text>
      </g>)}
    </svg>
  </>;
}
