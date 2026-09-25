import Decimal from 'decimal.js';
import { Link } from 'react-router-dom';

import { breakdownByCompany, type Breakdown } from '../pages/comparisonBoardBreakdown';
import { formatFraction, formatMoney, formatSignedMoney } from '../presentation/format';
import type { DiagnosticExecutionRecord, PreviewEnvelope, ScenarioDocument, StudyDocument } from '../study/model';
import { Button } from '../ui/Button';

type Row = Readonly<{
  scenario: ScenarioDocument;
  execution: DiagnosticExecutionRecord | null;
  envelope: PreviewEnvelope | null;
  breakdown: Breakdown | null;
}>;

export function currentDiagnostic(study: StudyDocument, scenario: ScenarioDocument): DiagnosticExecutionRecord | null {
  return [...study.executions].reverse().find((item): item is DiagnosticExecutionRecord =>
    item.kind === 'DIAGNOSTIC' && item.scenarioId === scenario.id && item.status === 'SUCCEEDED'
    && item.envelope !== null && item.scenarioRevision === scenario.revision
    && item.inputFingerprint === scenario.inputFingerprint) ?? null;
}

function rowFor(study: StudyDocument, scenario: ScenarioDocument): Row {
  const execution = currentDiagnostic(study, scenario);
  const envelope = (execution?.envelope?.selected_execution ?? null) as PreviewEnvelope | null;
  let breakdown: Breakdown | null = null;
  if (execution !== null && envelope !== null) {
    try {
      breakdown = breakdownByCompany(envelope, execution.sourceSnapshot.orders, execution.premisesSnapshot.costs);
    } catch {
      breakdown = null;
    }
  }
  return { scenario, execution, envelope, breakdown };
}

export function VariationComparison({ study, selectedScenarioId, running, progress, onRunAll }: Readonly<{
  study: StudyDocument;
  selectedScenarioId: string;
  running: boolean;
  progress: string | null;
  onRunAll(): void;
}>) {
  if (study.scenarios.length < 2) return null;
  const rows = study.scenarios.map((scenario) => rowFor(study, scenario));
  const base = rows.find((row) => row.scenario.id === study.baseScenarioId) ?? rows[0]!;
  const pending = rows.filter((row) => row.execution === null).length;
  const groups = [...new Set(rows.flatMap((row) => row.breakdown?.companies.map((item) => item.group) ?? []))].sort();
  const delta = (value: string | undefined, reference: string | undefined) =>
    value === undefined || reference === undefined ? null : new Decimal(value).minus(reference).toFixed();
  const link = (scenario: ScenarioDocument) => `/estudos/${encodeURIComponent(study.id)}/diagnostico?scenarioId=${encodeURIComponent(scenario.id)}`;

  return <section className="variation-comparison" aria-labelledby="variation-comparison-title">
    <h2 id="variation-comparison-title">Original × variações</h2>
    <div className="source-actions">
      <span className="field-hint">{pending === 0 ? 'Todos os cenários têm diagnóstico atual.' : `${pending} cenário(s) sem diagnóstico atual.`}</span>
      <Button disabled={running || pending === 0} onClick={onRunAll}>{running ? progress ?? 'Rodando…' : 'Rodar todas'}</Button>
    </div>
    <div className="table-scroll">
      <table className="company-table">
        <caption>Diferença sempre contra “{base.scenario.name}”</caption>
        <thead><tr>
          <th scope="col">Cenário</th><th scope="col">Ordens</th><th scope="col">Netabilidade</th>
          <th scope="col">Custo sem pool</th><th scope="col">Custo com pool</th><th scope="col">Economia</th><th scope="col">Δ economia</th>
        </tr></thead>
        <tbody>{rows.map((row) => {
          const aggregate = row.envelope?.result.agregado;
          const diff = row === base ? null : delta(aggregate?.economia_periodo_brl, base.envelope?.result.agregado.economia_periodo_brl);
          return <tr key={row.scenario.id} aria-current={row.scenario.id === selectedScenarioId ? 'true' : undefined}>
            <th scope="row"><Link to={link(row.scenario)}>{row.scenario.name}</Link>
              <small>{row === base ? 'original' : 'variação'}{row.execution === null ? ' · sem diagnóstico' : ''}</small></th>
            <td>{row.scenario.sourceSnapshot.orders.length}</td>
            <td>{aggregate === undefined ? '—' : formatFraction(aggregate.taxa_netabilidade_periodo)}</td>
            <td>{aggregate === undefined ? '—' : formatMoney(aggregate.baseline_periodo.total)}</td>
            <td>{aggregate === undefined ? '—' : formatMoney(aggregate.netado_periodo.total)}</td>
            <td>{aggregate === undefined ? '—' : formatMoney(aggregate.economia_periodo_brl)}</td>
            <td>{diff === null ? '—' : formatSignedMoney(diff)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {groups.length === 0 ? null : <div className="table-scroll">
      <table className="company-table">
        <caption>Economia por empresa (prefixo do ID da operação)</caption>
        <thead><tr><th scope="col">Cenário</th>{groups.map((group) => <th scope="col" key={group}>{group}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.scenario.id}>
          <th scope="row">{row.scenario.name}</th>
          {groups.map((group) => {
            const item = row.breakdown?.companies.find((company) => company.group === group);
            const reference = base.breakdown?.companies.find((company) => company.group === group);
            const diff = row === base || item === undefined ? null : delta(item.savings, reference?.savings ?? '0');
            return <td key={group}>{item === undefined ? '—' : formatMoney(item.savings)}
              {diff === null ? null : <small>{formatSignedMoney(diff)} vs original</small>}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
