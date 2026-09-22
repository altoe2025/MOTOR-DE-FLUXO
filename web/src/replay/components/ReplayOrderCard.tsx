import { formatMoney } from '../../presentation/format';
import type { OpenReplayOrder } from '../domain';

export function ReplayOrderCard({ order, departing = false }: Readonly<{
  order: OpenReplayOrder;
  departing?: boolean;
}>) {
  return <article
    className={`replay-order replay-order--${order.direction.toLowerCase()}${departing ? ' replay-order--departing' : ''}`}
    aria-label={`${order.direction} ${order.orderId}`}
    data-order-id={order.orderId}
    data-direction={order.direction}
  >
    <div className="replay-order__topline"><strong>{order.direction}</strong><span>{order.cohort === 'WARMUP' ? 'Aquecimento' : 'Medição'}</span></div>
    <p className="replay-order__id">{order.orderId}</p>
    <p className="replay-order__client">{order.clientId}</p>
    <p className="replay-order__value">{departing ? 'Liquidada' : formatMoney(order.openValueBrl)}</p>
    <p className="replay-order__deadline">Prazo D{order.deadlineDay}</p>
  </article>;
}
