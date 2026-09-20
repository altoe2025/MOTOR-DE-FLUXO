import type { ReactNode } from 'react';

import type {
  EvidenceValue,
  OperationalProfileVersion,
  ProfileCoverage as Coverage,
} from '../domain';

const stateLabels = {
  NOT_COLLECTED: 'Não coletado',
  INSUFFICIENT_COVERAGE: 'Cobertura insuficiente',
  INCOMPATIBLE: 'Incompatível',
} as const;

export function EvidenceValueView<T>({
  evidence,
  renderAvailable,
}: {
  evidence: EvidenceValue<T>;
  renderAvailable: (value: T) => ReactNode;
}) {
  if (evidence.state === 'AVAILABLE') return <>{renderAvailable(evidence.value)}</>;
  return <span className="evidence-unavailable">{stateLabels[evidence.state]}: {evidence.reason}</span>;
}

function Value<T>({ evidence, render = String }: {
  evidence: EvidenceValue<T>;
  render?: (value: T) => ReactNode;
}) {
  return <EvidenceValueView evidence={evidence} renderAvailable={render} />;
}

export function CoverageSummary({ coverage }: { coverage: Coverage }) {
  return (
    <dl className="profile-summary">
      <div><dt>Período</dt><dd>{coverage.firstDate} a {coverage.lastDate}</dd></div>
      <div><dt>Casos</dt><dd>{coverage.caseCount}</dd></div>
      <div><dt>Dias cobertos</dt><dd>{coverage.coveredDays}</dd></div>
      <div><dt>Sobreposição</dt><dd>{coverage.overlapDays} dias</dd></div>
      <div><dt>Lacunas</dt><dd>{coverage.gapDays} dias</dd></div>
    </dl>
  );
}

export function ProfileCoverage({ profile }: { profile: OperationalProfileVersion }) {
  const metrics = profile.metrics;
  return (
    <div className="profile-coverage">
      <CoverageSummary coverage={profile.coverage} />
      <dl className="profile-metrics">
        <div><dt>Volume OUT</dt><dd><Value evidence={metrics.volume.outBrl} /></dd></div>
        <div><dt>Volume IN</dt><dd><Value evidence={metrics.volume.inBrl} /></dd></div>
        <div><dt>Volume total</dt><dd><Value evidence={metrics.volume.totalBrl} /></dd></div>
        <div><dt>Ordens</dt><dd><Value evidence={metrics.frequency.orderCount} /></dd></div>
        <div><dt>Ordens/dia coberto</dt><dd><Value evidence={metrics.frequency.ordersPerCoveredDay} /></dd></div>
        <div><dt>Ordens/30 dias</dt><dd><Value evidence={metrics.frequency.ordersPer30Days} /></dd></div>
        {Object.entries(metrics.ticketsBrl).map(([label, evidence]) => <div key={label}><dt>Ticket {label}</dt><dd><Value evidence={evidence} /></dd></div>)}
        <div><dt>Direção</dt><dd><Value evidence={metrics.direction} render={(value) => `OUT ${value.out.fraction} · IN ${value.in.fraction}`} /></dd></div>
        {Object.entries(metrics.deadlineDays).map(([label, evidence]) => <div key={label}><dt>Prazo {label}</dt><dd><Value evidence={evidence} /></dd></div>)}
        <div><dt>Finalidades</dt><dd><Value evidence={metrics.purposes.byCode} render={(value) => value.length === 0 ? 'nenhuma finalidade coletada' : value.map((item) => item.code).join(', ')} /></dd></div>
        <div><dt>Cobertura de finalidade</dt><dd><Value evidence={metrics.purposes.knownCoverage} render={(value) => `${value.volumeFraction} do volume · ${value.orderFraction} das ordens`} /></dd></div>
        <div><dt>Finalidade ausente</dt><dd><Value evidence={metrics.purposes.missing} render={(value) => `${value.volumeBrl} BRL · ${value.orderCount} ordens`} /></dd></div>
        <div><dt>Janelas</dt><dd><Value evidence={metrics.windows} render={(value) => `${value.coveredDays} dias cobertos`} /></dd></div>
        <div><dt>Comparação sazonal</dt><dd><Value evidence={metrics.seasonality.comparison} render={(value) => `${value.coveredMonthCount} meses cobertos`} /></dd></div>
      </dl>
      <section aria-label="Sazonalidade observada">
        <h4>Sazonalidade observada</h4>
        <Value evidence={metrics.seasonality.observations} render={(observations) => (
          <ul className="seasonality-list">
            {observations.map((item) => <li key={item.month}>
              <strong>{item.month}</strong> — {item.coveredDays} dias cobertos · {item.averageVolumePerCoveredDay} BRL e {item.averageOrdersPerCoveredDay} ordens de média por dia coberto
            </li>)}
          </ul>
        )} />
      </section>
    </div>
  );
}
