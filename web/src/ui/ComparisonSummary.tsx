import type { PreviewEnvelope } from '../study/types';
import { formatFraction, formatMoney } from '../presentation/format';

export function ComparisonSummary({ envelope }: { envelope: PreviewEnvelope }) {
  const aggregate = envelope.result.agregado;
  return (
    <section className="comparison-summary" aria-labelledby="comparison-summary-title">
      <p className="eyebrow">Prévia canônica</p>
      <h2 id="comparison-summary-title">Resumo da comparação</h2>
      <dl>
        <div><dt>Economia no período</dt><dd>{formatMoney(aggregate.economia_periodo_brl)}</dd></div>
        <div><dt>Volume compensado</dt><dd>{formatMoney(aggregate.volume_casado_periodo_brl)}</dd></div>
        <div><dt>Taxa de netabilidade</dt><dd>{formatFraction(aggregate.taxa_netabilidade_periodo)}</dd></div>
      </dl>
    </section>
  );
}
