import Decimal from 'decimal.js';

import { formatFraction, formatMoney } from '../../presentation/format';
import type { ReplayDocument, ReplayState } from '../domain';

export function ReplayMetrics({ document, state }: Readonly<{ document: ReplayDocument; state: ReplayState }>) {
  const remitted = new Decimal(state.endState.remitted_out_accumulated_brl).plus(state.endState.remitted_in_accumulated_brl).toFixed();
  return <section className="replay-metrics" aria-label="Acumulados do Replay">
    <div className="replay-metric replay-metric--matched"><span>Casado acumulado</span><strong>{formatMoney(state.endState.measured_matched_contribution_accumulated_brl)}</strong><small>contribuição medida OUT + IN</small></div>
    <div className="replay-metric replay-metric--remitted"><span>Remetido acumulado</span><strong>{formatMoney(remitted)}</strong><small>OUT {formatMoney(state.endState.remitted_out_accumulated_brl)} · IN {formatMoney(state.endState.remitted_in_accumulated_brl)}</small></div>
    <div className="replay-metric replay-metric--rate"><span>Netabilidade canônica</span><strong>{formatFraction(document.totals.netability_fraction)}</strong><small>repetição selecionada</small></div>
  </section>;
}
