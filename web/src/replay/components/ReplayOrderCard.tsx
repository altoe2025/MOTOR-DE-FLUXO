import { useEffect, useRef, useState } from 'react';

import { formatMoney } from '../../presentation/format';
import type { OpenReplayOrder } from '../domain';

const VALUE_TWEEN_MS = 900;

/** Conta o saldo exibido até o novo valor; o texto final é sempre o valor exato. */
function useCountedValue(value: string, enabled: boolean): string {
  const [shown, setShown] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    const from = Number(last.current), to = Number(value);
    last.current = value;
    if (!enabled || from === to || !Number.isFinite(from) || !Number.isFinite(to) || typeof requestAnimationFrame !== 'function') {
      setShown(value);
      return undefined;
    }
    // Um relógio só (performance.now) no início e em cada quadro.
    const startedAt = performance.now();
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / VALUE_TWEEN_MS);
      if (progress >= 1) { setShown(value); return; }
      setShown((from + (to - from) * (1 - (1 - progress) ** 3)).toFixed(2));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [enabled, value]);
  return shown;
}

export function ReplayOrderCard({
  order, valueBrl = order.openValueBrl, settled = false, leaving = false, arriving = false, animateValue = false,
  focused = false, day, company, dateOf = null,
}: Readonly<{
  order: OpenReplayOrder;
  /** Saldo a exibir; antes do fechamento é o saldo de abertura do dia. */
  valueBrl?: string;
  settled?: boolean;
  leaving?: boolean;
  arriving?: boolean;
  animateValue?: boolean;
  focused?: boolean;
  day?: number;
  company?: string;
  dateOf?: ((day: number) => string) | null;
}>) {
  const shown = useCountedValue(valueBrl, animateValue);
  const span = Math.max(1, order.deadlineDay - order.knownDay);
  const left = day === undefined ? null : Math.max(0, order.deadlineDay - day);
  const classes = [
    'replay-order', `replay-order--${order.direction.toLowerCase()}`,
    settled ? 'replay-order--departing' : '', leaving ? 'replay-order--leaving' : '',
    arriving ? 'replay-order--arriving' : '', focused ? 'replay-order--focus' : '',
  ].filter(Boolean).join(' ');
  return <article
    className={classes}
    aria-label={`${order.direction} ${order.orderId}`}
    data-order-id={order.orderId}
    data-direction={order.direction}
    title={order.orderId}
  >
    <div className="replay-order__topline"><strong>{order.direction}</strong><span>{order.cohort === 'WARMUP' ? 'Aquecimento' : 'Medição'}</span></div>
    {company === undefined ? null : <p className="replay-order__company">{company}</p>}
    <p className="replay-order__value">{settled ? <>✓ Liquidada</> : formatMoney(shown)}</p>
    <p className="replay-order__deadline">
      <span>Prazo D{order.deadlineDay}{dateOf === null ? '' : ` · ${dateOf(order.deadlineDay)}`}</span>
      {left === null ? null : <span className={`replay-order__clock${left <= 1 ? ' replay-order__clock--urgent' : ''}`} aria-hidden="true">
        <i style={{ width: `${Math.round(100 * (1 - left / span))}%` }} />
      </span>}
    </p>
  </article>;
}
