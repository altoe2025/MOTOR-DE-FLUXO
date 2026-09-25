import type { DiagnosticExecutionRecord } from '../../study/model';
import {
  evidencePresentation,
  formatMetric,
  type ChartSeries,
  type EvidenceMetric,
  type MetricUnit,
} from '../presentation';
import { ChartWithTable } from './EChart';

type DiagnosticEnvelope = NonNullable<DiagnosticExecutionRecord['envelope']>;
type AxisCode = DiagnosticEnvelope['consequences'][number]['axis'];
type ScalarRow = readonly [label: string, metric: EvidenceMetric, unit: MetricUnit];

const consequenceText: Readonly<Record<string, string>> = {
  DIRECAO_OPOSTA_AUSENTE: 'Não há fluxo da direção oposta para formar potencial de casamento.',
  POTENTIAL_NAO_CAPTURADO: 'Parte do potencial estrutural não foi capturada pela política.',
  RESIDUO_TRANSFRONTEIRICO: 'Há volume residual que ainda cruza a fronteira.',
  DISPERSAO_ECONOMICA_OBSERVADA: 'Os resultados econômicos variaram entre as repetições.',
};

function MetricTable({ title, rows }: Readonly<{ title: string; rows: readonly ScalarRow[] }>) {
  return <div className="table-scroll" role="region" tabIndex={0} aria-label={`Tabela rolável — ${title}`}><table className="diagnostic-table">
    <caption>{title}</caption>
    <thead><tr><th scope="col">Métrica</th><th scope="col">Valor</th><th scope="col">Evidência</th></tr></thead>
    <tbody>{rows.map(([label, metric, unit]) => {
      const presented = evidencePresentation(metric, unit);
      return <tr key={label}><th scope="row">{label}</th><td>{presented.state === 'AVAILABLE' ? presented.formatted : `${presented.label}: ${presented.reason}`}</td>
        <td>{presented.evidence.length === 0 ? 'Sem referência adicional' : presented.evidence.join(', ')}</td></tr>;
    })}</tbody>
  </table></div>;
}

function scalarSeries(name: string, unit: MetricUnit, rows: readonly ScalarRow[]): ChartSeries | null {
  const points = rows.flatMap(([label, metric, metricUnit]) => metric.state === 'AVAILABLE' && metricUnit === unit ? [{ label, value: metric.value }] : []);
  return points.length === 0 ? null : { name, unit, points };
}

function Interpretation({ axis, axisKey, consequences, limitations }: Readonly<{
  axis: AxisCode;
  axisKey: keyof DiagnosticEnvelope['axes'];
  consequences: DiagnosticEnvelope['consequences'];
  limitations: DiagnosticEnvelope['limitations'];
}>) {
  const relevantConsequences = consequences.filter((item) => item.axis === axis);
  const marker = `/axes/${axisKey}/`;
  const relevantLimitations = limitations.filter((item) => item.evidence_refs.some((reference) => reference.includes(marker)));
  return <div className="diagnostic-interpretation">
    <div><h3>Consequências factuais</h3>{relevantConsequences.length === 0 ? <p>Nenhuma consequência acionada para este eixo.</p> : <ul>{relevantConsequences.map((item) => <li key={item.rule_id}>
      <strong>{item.statement_code}</strong> — {consequenceText[item.statement_code] ?? 'Consequência registrada pelo diagnóstico.'}
      <EvidenceRefs refs={item.evidence_refs} />
    </li>)}</ul>}</div>
    <div><h3>Limitações</h3>{relevantLimitations.length === 0 ? <p>Nenhuma limitação específica registrada para este eixo.</p> : <ul>{relevantLimitations.map((item) => <li key={item.code}>
      <strong>{item.code}</strong> ({item.severity}) — {item.condition}<EvidenceRefs refs={item.evidence_refs} />
    </li>)}</ul>}</div>
  </div>;
}

function EvidenceRefs({ refs }: Readonly<{ refs: readonly string[] }>) {
  return refs.length === 0 ? null : <ul className="evidence-refs" aria-label="Referências de evidência">{refs.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul>;
}

function AxisSection({ id, title, question, axis, axisKey, rows, consequences, limitations, children }: Readonly<{
  id: string;
  title: string;
  question: string;
  axis: AxisCode;
  axisKey: keyof DiagnosticEnvelope['axes'];
  rows?: readonly ScalarRow[];
  consequences: DiagnosticEnvelope['consequences'];
  limitations: DiagnosticEnvelope['limitations'];
  children?: React.ReactNode;
}>) {
  const series = rows === undefined ? null : scalarSeries(title, rows[0]?.[2] ?? 'NUMBER', rows);
  return <section className="diagnostic-axis" role="region" aria-labelledby={id}>
    <h2 id={id}>{title}</h2><p className="axis-question">{question}</p>
    {rows === undefined ? null : <><MetricTable title={`${title} — métricas`} rows={rows} />{series === null ? null : <ChartWithTable series={series} description={`${title}: comparação visual das métricas disponíveis; valores exatos na tabela.`} />}</>}
    {children}
    <Interpretation axis={axis} axisKey={axisKey} consequences={consequences} limitations={limitations} />
  </section>;
}

export function DiagnosticAxesView({ axes, consequences, limitations }: Readonly<{
  axes: DiagnosticEnvelope['axes'];
  consequences: DiagnosticEnvelope['consequences'];
  limitations: DiagnosticEnvelope['limitations'];
}>) {
  const structural: readonly ScalarRow[] = [
    ['Bruto OUT', axes.structural_potential.gross_out_brl, 'BRL'], ['Bruto IN', axes.structural_potential.gross_in_brl, 'BRL'],
    ['Desequilíbrio', axes.structural_potential.imbalance_brl, 'BRL'], ['Teto agregado', axes.structural_potential.ceiling_brl, 'BRL'],
  ];
  const capture: readonly ScalarRow[] = [
    ['Casado total', axes.policy_capture.matched_brl, 'BRL'], ['Intracliente', axes.policy_capture.intra_client_brl, 'BRL'],
    ['Intercliente', axes.policy_capture.inter_client_brl, 'BRL'], ['Potencial não capturado', axes.policy_capture.uncaptured_potential_brl, 'BRL'],
    ['Fração capturada', axes.policy_capture.captured_fraction, 'FRACTION'],
  ];
  const temporal: readonly ScalarRow[] = [
    ['Prazo', axes.temporal_compatibility.deadline_days, 'DAYS'], ['D+0', axes.temporal_compatibility.same_day_fraction, 'FRACTION'],
    ['Espera ponderada', axes.temporal_compatibility.weighted_wait_days, 'DAYS'], ['Fechamentos por janela', axes.temporal_compatibility.window_closures, 'NUMBER'],
    ['Fechamentos por prazo', axes.temporal_compatibility.deadline_closures, 'NUMBER'], ['Fechamentos no horizonte', axes.temporal_compatibility.horizon_closures, 'NUMBER'],
  ];
  const residual: readonly ScalarRow[] = [
    ['Remetido', axes.cross_border_residual.remitted_brl, 'BRL'], ['OUT remetido', axes.cross_border_residual.out_brl, 'BRL'], ['IN remetido', axes.cross_border_residual.in_brl, 'BRL'],
  ];
  const composition: readonly ScalarRow[] = [
    ['HHI', axes.composition_dependency.hhi, 'NUMBER'], ['Maior participação', axes.composition_dependency.largest_share, 'FRACTION'],
  ];
  const operational: readonly ScalarRow[] = [
    ['Ordens', axes.operational_profile.order_count, 'NUMBER'], ['Ciclos', axes.operational_profile.cycle_count, 'NUMBER'],
    ['Fila aberta máxima', axes.operational_profile.maximum_open_queue, 'NUMBER'], ['Vencimentos', axes.operational_profile.due_order_count, 'NUMBER'],
    ['Espera ponderada', axes.operational_profile.weighted_wait_days, 'DAYS'], ['Processamento', axes.operational_profile.processing_duration_ms, 'MS'],
  ];
  const common = { consequences, limitations };
  return <div className="diagnostic-axes">
    <AxisSection id="axis-structural" title="1. Potencial estrutural" question="Quanto OUT e IN poderiam se compensar na estrutura agregada?" axis="STRUCTURAL_POTENTIAL" axisKey="structural_potential" rows={structural} {...common} />
    <AxisSection id="axis-capture" title="2. Captura pela política" question="Quanto do potencial a política capturou, e por qual origem de casamento?" axis="POLICY_CAPTURE" axisKey="policy_capture" rows={capture} {...common} />
    <AxisSection id="axis-temporal" title="3. Compatibilidade temporal" question="Prazos e janelas permitiram que os fluxos coexistissem?" axis="TEMPORAL_COMPATIBILITY" axisKey="temporal_compatibility" rows={temporal} {...common} />
    <AxisSection id="axis-residual" title="4. Exposição residual" question="Que volume ainda precisou cruzar a fronteira?" axis="CROSS_BORDER_RESIDUAL" axisKey="cross_border_residual" rows={residual} {...common}>
      <BreakdownTable rows={axes.cross_border_residual.by_day} title="Resíduo por dia" />
      <BreakdownTable rows={axes.cross_border_residual.by_purpose} title="Resíduo por finalidade" />
    </AxisSection>
    <AxisSection id="axis-composition" title="5. Dependência da composição" question="O resultado depende de poucos participantes?" axis="COMPOSITION_DEPENDENCY" axisKey="composition_dependency" rows={composition} {...common}>
      <div className="table-scroll" role="region" tabIndex={0} aria-label="Tabela rolável — Participação por cliente"><table className="diagnostic-table"><caption>Participação por cliente</caption><thead><tr><th scope="col">Participante</th><th scope="col">Volume</th><th scope="col">Participação</th></tr></thead><tbody>{axes.composition_dependency.participants.map((item) => <tr key={item.participant_id}><th scope="row">{item.participant_id}</th><td>{formatMetric(item.volume_brl, 'BRL')}</td><td>{formatMetric(item.share, 'FRACTION')}</td></tr>)}</tbody></table></div>
    </AxisSection>
    <AxisSection id="axis-economic" title="6. Robustez econômica" question="Como custos, economia e netabilidade variaram entre repetições?" axis="ECONOMIC_ROBUSTNESS" axisKey="economic_robustness" {...common}>
      <DistributionAxisTable economics={axes.economic_robustness} />
    </AxisSection>
    <AxisSection id="axis-operational" title="7. Perfil operacional da carteira" question="Qual foi a carga operacional observada na execução?" axis="OPERATIONAL_PROFILE" axisKey="operational_profile" rows={operational} {...common} />
    <section className="diagnostic-card" aria-labelledby="all-limitations-heading"><h2 id="all-limitations-heading">Limitações do diagnóstico</h2>
      {limitations.length === 0 ? <p>Nenhuma limitação registrada.</p> : <ul>{limitations.map((item) => <li key={item.code}><strong>{item.code}</strong> ({item.severity}) — {item.condition}<EvidenceRefs refs={item.evidence_refs} /></li>)}</ul>}</section>
  </div>;
}

function BreakdownTable({ rows, title }: Readonly<{ rows: DiagnosticEnvelope['axes']['cross_border_residual']['by_day'] | DiagnosticEnvelope['axes']['cross_border_residual']['by_purpose']; title: string }>) {
  if (rows.length === 0) return <p className="evidence-unavailable">{title}: sem itens.</p>;
  return <div className="table-scroll" role="region" tabIndex={0} aria-label={`Tabela rolável — ${title}`}><table className="diagnostic-table"><caption>{title}</caption><thead><tr><th scope="col">Chave</th><th scope="col">Direção</th><th scope="col">Valor</th></tr></thead><tbody>{rows.map((row) => <tr key={JSON.stringify([row.key, row.direction])}><th scope="row">{row.key ?? 'Finalidade não coletada'}</th><td>{row.direction}</td><td>{formatMetric(row.value_brl, 'BRL')}</td></tr>)}</tbody></table></div>;
}

function DistributionAxisTable({ economics }: Readonly<{ economics: DiagnosticEnvelope['axes']['economic_robustness'] }>) {
  const rows = [['Baseline', economics.baseline_brl, 'BRL'], ['Custo netado', economics.netted_brl, 'BRL'], ['Economia', economics.savings_brl, 'BRL'], ['Netabilidade', economics.netability_fraction, 'FRACTION']] as const;
  return <div className="table-scroll" role="region" tabIndex={0} aria-label="Tabela rolável — Resumo da distribuição econômica"><table className="diagnostic-table"><caption>Resumo da distribuição econômica</caption><thead><tr><th scope="col">Métrica</th><th scope="col">Mínimo</th><th scope="col">P50</th><th scope="col">Máximo</th><th scope="col">Evidência</th></tr></thead><tbody>{rows.map(([label, metric, unit]) => <tr key={label}><th scope="row">{label}</th>{metric.state === 'AVAILABLE' ? <><td>{formatMetric(metric.value.minimum, unit)}</td><td>{formatMetric(metric.value.p50, unit)}</td><td>{formatMetric(metric.value.maximum, unit)}</td><td>{metric.evidence.join(', ')}</td></> : <td colSpan={4}>{metric.state}: {metric.reason}</td>}</tr>)}</tbody></table></div>;
}
