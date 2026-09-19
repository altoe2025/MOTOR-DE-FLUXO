import type { PreviewEnvelope } from '../study/model';
import { formatFraction, formatMoney } from '../presentation/format';

export function ComparisonSummary({ envelope }: { envelope: PreviewEnvelope }) {
  const aggregate = envelope.result.agregado;
  const mechanismByDestination = new Map(
    aggregate.mecanismos.map((mechanism) => [mechanism.destino, mechanism]),
  );
  const mechanisms = [
    {
      destination: 'INTRA_CLIENTE' as const,
      label: 'Autonetting — mesmo participante',
      rate: aggregate.taxa_autonetting_periodo,
      testId: 'autonetting-volume',
    },
    {
      destination: 'INTER_CLIENTE' as const,
      label: 'Netting multilateral — entre participantes',
      rate: aggregate.taxa_netting_multilateral_periodo,
      testId: 'multilateral-volume',
    },
    {
      destination: 'REMETIDO' as const,
      label: 'Remetido — cruzou a fronteira',
      rate: null,
      testId: 'remetido-volume',
    },
  ];
  return (
    <section className="comparison-summary" aria-labelledby="comparison-summary-title">
      <p className="eyebrow">Prévia canônica</p>
      <h2 id="comparison-summary-title">Resultado do motor</h2>
      <dl className="headline-metrics">
        <div><dt>Volume bruto</dt><dd>{formatMoney(aggregate.volume_bruto_periodo_brl)}</dd></div>
        <div><dt>Resíduo remetido</dt><dd>{formatMoney(aggregate.volume_remetido_periodo_brl)}</dd></div>
        <div><dt>Economia no período</dt><dd data-testid="economia-brl">{formatMoney(aggregate.economia_periodo_brl)}</dd></div>
        <div><dt>Volume compensado</dt><dd>{formatMoney(aggregate.volume_casado_periodo_brl)}</dd></div>
        <div><dt>Taxa de netabilidade</dt><dd data-testid="netabilidade">{formatFraction(aggregate.taxa_netabilidade_periodo)}</dd></div>
      </dl>
      <div className="mechanism-composition">
        <h3>Composição do fluxo</h3>
        <p>Atribuição contábil de custo e economia</p>
        <div className="mechanism-grid">
          {mechanisms.map((item, index) => {
            const mechanism = mechanismByDestination.get(item.destination);
            if (mechanism === undefined) {
              throw new Error(`mecanismo ausente: ${item.destination}`);
            }
            const headingId = `mechanism-${index}`;
            return (
              <div className="mechanism-card" role="group" aria-labelledby={headingId} key={item.destination}>
                <h4 id={headingId}>{item.label}</h4>
                <dl>
                  <div><dt>Volume</dt><dd data-testid={item.testId}>{formatMoney(mechanism.volume_brl)}</dd></div>
                  {item.rate === null ? null : (
                    <div><dt>Taxa sobre o volume bruto</dt><dd>{formatFraction(item.rate)}</dd></div>
                  )}
                  <div><dt>Custo atribuído</dt><dd>{formatMoney(mechanism.custo_netado_brl)}</dd></div>
                  <div><dt>Economia atribuída</dt><dd>{formatMoney(mechanism.economia_brl)}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
