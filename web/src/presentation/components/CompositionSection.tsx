import type { CommunicationDocumentV1, CommunicationMetric } from '../../communication/domain';
import { evidenceAttributes, hasEvidence, MetricList, metricText } from './DocumentItems';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MECHANISM_GROUPS: readonly Readonly<{ axis: string; title: string }>[] = [
  { axis: 'structural_potential', title: 'Potencial de casamento' },
  { axis: 'policy_capture', title: 'Quanto foi capturado' },
  { axis: 'temporal_compatibility', title: 'Encontro no tempo' },
  { axis: 'cross_border_residual', title: 'O que ainda cruza a fronteira' },
  { axis: 'operational_profile', title: 'Operação' },
];

const HIDDEN_MECHANISM_CODES: ReadonlySet<string> = new Set([
  'operational_profile.processing_duration_ms', 'operational_profile.weighted_wait_days',
]);

const CONSEQUENCE_TEXT: Readonly<Record<string, string>> = {
  DIRECAO_OPOSTA_AUSENTE: 'Não há fluxo da direção oposta para formar potencial de casamento.',
  POTENTIAL_NAO_CAPTURADO: 'Parte do potencial estrutural não foi capturada pela política.',
  RESIDUO_TRANSFRONTEIRICO: 'Há volume residual que ainda cruza a fronteira.',
  DISPERSAO_ECONOMICA_OBSERVADA: 'Os resultados econômicos variaram entre as repetições.',
};

const COMPOSITION_LABELS: Readonly<Record<string, string>> = {
  'composition_dependency.hhi': 'Concentração (HHI)',
  'composition_dependency.largest_share': 'Maior participação',
};

type ParticipantRow = Readonly<{ id: string; volume: CommunicationMetric; share: CommunicationMetric | undefined }>;

function participantRows(metrics: readonly CommunicationMetric[]): ParticipantRow[] {
  return metrics.filter((metric) => /^participant\.\d+\.volume$/.test(metric.code)).map((volume) => {
    const prefix = volume.code.slice(0, -'volume'.length);
    return { id: volume.label.replace(/^Volume /, ''), volume,
      share: metrics.find((metric) => metric.code === `${prefix}share`) };
  });
}

export function CompositionSection({ document, participantNames }: Readonly<{
  document: CommunicationDocumentV1;
  participantNames: Readonly<Record<string, string>>;
}>) {
  const rows = participantRows(document.composition.metrics);
  const named = rows.map((row, index) => ({ ...row, name: participantNames[row.id]
    ?? (UUID.test(row.id) ? `Participante ${index + 1}` : row.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  const headline = document.composition.metrics.filter((metric) => metric.code in COMPOSITION_LABELS);
  const consequences = document.mechanism.facts
    .filter((fact) => hasEvidence(document, fact.evidenceRefs) && CONSEQUENCE_TEXT[fact.value] !== undefined);
  return <section id="composicao" aria-labelledby="composicao-title" data-route-id="presentation" data-help-id="concept.composicao">
    <h2 id="composicao-title">Composição e mecanismo</h2>
    <p className="presentation-lead">{document.source.label} · {rows.length} {rows.length === 1 ? 'participante' : 'participantes'}.</p>
    <MetricList document={document} metrics={headline} labels={COMPOSITION_LABELS} />
    {rows.length === 0 ? null : <div className="table-scroll"><table className="presentation-table">
      <caption className="visually-hidden">Participantes da carteira</caption>
      <thead><tr><th scope="col">Participante</th><th scope="col">Volume</th><th scope="col">Participação</th></tr></thead>
      <tbody>{named.map((row) => <tr key={row.volume.code} {...evidenceAttributes(document, row.volume.evidenceRefs)}>
        <th scope="row">{row.name}</th>
        <td>{metricText(document, row.volume)}</td>
        <td>{row.share === undefined ? 'Não disponível' : metricText(document, row.share)}</td>
      </tr>)}</tbody>
    </table></div>}
    <h3>Mecanismo</h3>
    <div className="presentation-mechanism">{MECHANISM_GROUPS.map(({ axis, title }) => {
      const metrics = document.mechanism.metrics.filter((metric) => metric.code.startsWith(`${axis}.`)
        && !HIDDEN_MECHANISM_CODES.has(metric.code));
      if (metrics.length === 0) return null;
      return <div key={axis} className="presentation-mechanism__group">
        <h4>{title}</h4>
        <dl>{metrics.map((metric) => <div key={metric.code} {...evidenceAttributes(document, metric.evidenceRefs)}>
          <dt>{metric.label}</dt><dd>{metricText(document, metric)}</dd>
        </div>)}</dl>
      </div>;
    })}</div>
    {consequences.length === 0 ? null : <>
      <h3>O que isso significa</h3>
      <ul className="presentation-consequences">{consequences.map((fact) => <li key={fact.code}
        {...evidenceAttributes(document, fact.evidenceRefs)}>{CONSEQUENCE_TEXT[fact.value]}</li>)}</ul>
    </>}
  </section>;
}
