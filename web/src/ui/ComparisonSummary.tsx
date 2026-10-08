import type { PreviewEnvelope } from '../study/model';
import { formatFraction, formatMoney } from '../presentation/format';

const MECHANISMS = [
  { destination: 'INTRA_CLIENTE' as const, label: 'Autonetting — mesmo participante', rate: 'taxa_autonetting_periodo' as const, testId: 'autonetting-volume' },
  { destination: 'INTER_CLIENTE' as const, label: 'Netting multilateral — entre participantes', rate: 'taxa_netting_multilateral_periodo' as const, testId: 'multilateral-volume' },
  { destination: 'REMETIDO' as const, label: 'Remetido — cruzou a fronteira', rate: null, testId: 'remetido-volume' },
];

/** Volumes do período: bruto, compensado e o resíduo que cruzou a fronteira. */
export function FlowVolumes({ envelope }: { envelope: PreviewEnvelope }) {
  const aggregate = envelope.result.agregado;
  return <dl className="headline-metrics">
    <div><dt>Volume bruto</dt><dd>{formatMoney(aggregate.volume_bruto_periodo_brl)}</dd></div>
    <div><dt>Volume compensado</dt><dd>{formatMoney(aggregate.volume_casado_periodo_brl)}</dd></div>
    <div><dt>Resíduo remetido</dt><dd>{formatMoney(aggregate.volume_remetido_periodo_brl)}</dd></div>
  </dl>;
}

/** Quanto de volume, custo e economia cabe a cada mecanismo (mesmo participante, entre participantes, remetido). */
export function MechanismComposition({ envelope }: { envelope: PreviewEnvelope }) {
  const aggregate = envelope.result.agregado;
  const mechanismByDestination = new Map(aggregate.mecanismos.map((mechanism) => [mechanism.destino, mechanism]));
  return <div className="mechanism-composition">
    <h3>Composição do fluxo</h3>
    <p>Atribuição contábil de custo e economia</p>
    <div className="mechanism-grid">
      {MECHANISMS.map((item, index) => {
        const mechanism = mechanismByDestination.get(item.destination);
        if (mechanism === undefined) {
          throw new Error(`mecanismo ausente: ${item.destination}`);
        }
        const headingId = `mechanism-${index}`;
        return <div className="mechanism-card" role="group" aria-labelledby={headingId} key={item.destination}>
          <h4 id={headingId}>{item.label}</h4>
          <dl>
            <div><dt>Volume</dt><dd data-testid={item.testId}>{formatMoney(mechanism.volume_brl)}</dd></div>
            {item.rate === null ? null : <div><dt>Taxa sobre o volume bruto</dt><dd>{formatFraction(aggregate[item.rate])}</dd></div>}
            <div><dt>Custo atribuído</dt><dd>{formatMoney(mechanism.custo_netado_brl)}</dd></div>
            <div><dt>Economia atribuída</dt><dd>{formatMoney(mechanism.economia_brl)}</dd></div>
          </dl>
        </div>;
      })}
    </div>
  </div>;
}

/** A resposta do diagnóstico em três números: economia, netabilidade e custo sem → com pool. */
export function ResultHeadline({ envelope }: { envelope: PreviewEnvelope }) {
  const aggregate = envelope.result.agregado;
  const netability = Math.min(100, Math.max(0, Number(aggregate.taxa_netabilidade_periodo) * 100));
  return <section className="result-headline" aria-labelledby="comparison-summary-title">
    <h2 id="comparison-summary-title" className="visually-hidden">Resultado do motor</h2>
    <dl className="result-headline__metrics">
      <div className="result-headline__metric result-headline__metric--main"><dt>Economia no período</dt><dd data-testid="economia-brl">{formatMoney(aggregate.economia_periodo_brl)}</dd></div>
      <div className="result-headline__metric"><dt>Netabilidade</dt><dd data-testid="netabilidade">{formatFraction(aggregate.taxa_netabilidade_periodo)}</dd>
        <dd className="result-headline__bar" aria-hidden="true"><i style={{ width: `${netability}%` }} /></dd>
        <dd className="metric-hint">do volume não cruzou a fronteira</dd></div>
      <div className="result-headline__metric"><dt>Custo</dt><dd className="result-headline__cost">{formatMoney(aggregate.baseline_periodo.total)} → {formatMoney(aggregate.netado_periodo.total)}</dd>
        <dd className="metric-hint">sem pool → com pool</dd></div>
    </dl>
  </section>;
}

export function ComparisonSummary({ envelope }: { envelope: PreviewEnvelope }) {
  const aggregate = envelope.result.agregado;
  return (
    <section className="comparison-summary" aria-labelledby="comparison-summary-title">
      <h2 id="comparison-summary-title">Resultado do motor</h2>
      <dl className="headline-metrics">
        <div><dt>Volume bruto</dt><dd>{formatMoney(aggregate.volume_bruto_periodo_brl)}</dd></div>
        <div><dt>Resíduo remetido</dt><dd>{formatMoney(aggregate.volume_remetido_periodo_brl)}</dd></div>
        <div><dt>Economia no período</dt><dd data-testid="economia-brl">{formatMoney(aggregate.economia_periodo_brl)}</dd></div>
        <div><dt>Volume compensado</dt><dd>{formatMoney(aggregate.volume_casado_periodo_brl)}</dd></div>
        <div><dt>Taxa de netabilidade</dt><dd data-testid="netabilidade">{formatFraction(aggregate.taxa_netabilidade_periodo)}</dd><dd className="metric-hint">parte do volume que não cruzou a fronteira</dd></div>
      </dl>
      <MechanismComposition envelope={envelope} />
    </section>
  );
}
