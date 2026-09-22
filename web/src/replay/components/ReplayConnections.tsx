import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

import type { ReplayDocument } from '../domain';
import { anchoredCurve, remittanceCurve, type AnchoredCurve, type Box } from '../geometry';

type Path = Readonly<{ id: string; curve: AnchoredCurve; kind: 'MATCHED' | 'REMITTED'; direction?: 'OUT' | 'IN' }>;

function box(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function ReplayConnections({ stageRef, document, day, active, transitionKey }: Readonly<{
  stageRef: RefObject<HTMLDivElement | null>;
  document: ReplayDocument;
  day: number;
  active: boolean;
  transitionKey: number;
}>) {
  const [paths, setPaths] = useState<readonly Path[]>([]);
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (stage === null || !active) {
      setPaths([]);
      return;
    }
    const stageBox = box(stage.getBoundingClientRect());
    const cards = new Map<string, Box>();
    for (const element of stage.querySelectorAll<HTMLElement>('[data-order-id]')) {
      const orderId = element.dataset.orderId;
      if (orderId !== undefined) cards.set(orderId, box(element.getBoundingClientRect()));
    }
    const replayDay = document.days[day]!;
    const next: Path[] = [];
    for (const [index, segment] of (replayDay.closing?.flow_segments ?? []).entries()) {
      const out = cards.get(segment.out_order_id);
      const incoming = cards.get(segment.in_order_id);
      if (out !== undefined && incoming !== undefined) next.push({
        id: `matched-${index}-${segment.out_order_id}-${segment.in_order_id}`,
        curve: anchoredCurve(stageBox, out, incoming),
        kind: 'MATCHED',
      });
    }
    for (const event of replayDay.events) {
      if (event.kind !== 'ALLOCATION' || event.allocation_type !== 'REMETIDO') continue;
      const card = cards.get(event.order_id);
      if (card !== undefined) next.push({
        id: `remitted-${event.sequence}-${event.order_id}`,
        curve: remittanceCurve(stageBox, card, event.direction),
        kind: 'REMITTED',
        direction: event.direction,
      });
    }
    setPaths(next);
  }, [active, day, document, stageRef]);

  useLayoutEffect(() => {
    measure();
    const stage = stageRef.current;
    if (stage === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    for (const card of stage.querySelectorAll<HTMLElement>('[data-order-id]')) observer.observe(card);
    return () => observer.disconnect();
  }, [measure, stageRef, transitionKey]);

  if (!active || paths.length === 0) return null;
  return <svg className="replay-connections" aria-hidden="true" focusable="false">
    <defs>
      <marker id="replay-arrow-matched" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker>
      <marker id="replay-arrow-remitted" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker>
    </defs>
    {paths.map((path) => <path
      key={`${transitionKey}-${path.id}`}
      d={path.curve.path}
      className={`replay-connection replay-connection--${path.kind.toLowerCase()}${path.direction === undefined ? '' : ` replay-connection--${path.direction.toLowerCase()}`}`}
      markerEnd={`url(#replay-arrow-${path.kind.toLowerCase()})`}
    />)}
  </svg>;
}
