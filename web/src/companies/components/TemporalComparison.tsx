import Decimal from 'decimal.js';
import { useMemo, useState } from 'react';

import type { ObservedCase } from '../../cases/domain';
import { formatMoney } from '../../presentation/format';
import type { OperationalProfileVersion } from '../../profiles/domain';
import {
  compareCompanyTimeline,
  projectObservedCaseForTimeline,
  projectProfileForTimeline,
  type TimelineMetricValue,
  type TimelineObservation,
} from '../temporalComparison';

function formatValue(value: TimelineMetricValue, unit: string): string {
  if (value.state !== 'AVAILABLE') return `${value.state}: ${value.reason}`;
  if (unit === 'BRL') return formatMoney(value.value);
  if (unit === 'FRACTION') return `${new Decimal(value.value).times(100).toString()}%`;
  if (unit === 'DAYS') return `${value.value} dia(s)`;
  return value.value;
}

function observationOptions(
  cases: readonly ObservedCase[],
  profiles: readonly OperationalProfileVersion[],
): readonly TimelineObservation[] {
  return [
    ...cases.map(projectObservedCaseForTimeline),
    ...profiles.map(projectProfileForTimeline),
  ].sort((left, right) => left.period.startDate.localeCompare(right.period.startDate) || left.id.localeCompare(right.id));
}

export function TemporalComparison({ cases, profiles }: {
  cases: readonly ObservedCase[];
  profiles: readonly OperationalProfileVersion[];
}) {
  const options = useMemo(() => observationOptions(cases, profiles), [cases, profiles]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const selected = options.filter((item) => selectedIds.includes(item.id));
  const comparison = selected.length >= 2 ? compareCompanyTimeline(selected) : null;
  return (
    <section id="comparacao-temporal" className="temporal-comparison" aria-label="Comparação temporal">
      <h2>Comparação temporal</h2>
      <p>Selecione de 2 a 6 casos ou versões de Perfil Operacional da mesma empresa.</p>
      {options.length < 2 ? <p className="empty-copy">São necessárias ao menos duas observações versionadas.</p> : (
        <fieldset>
          <legend>Observações</legend>
          {options.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selectedIds.length >= 6}
                  onChange={() => setSelectedIds((current) => checked
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id])}
                />
                {item.label} · {item.period.startDate} a {item.period.endDate}
              </label>
            );
          })}
        </fieldset>
      )}
      {comparison === null ? <p className="inline-notice">Selecione ao menos duas observações.</p> : (
        <>
          <section aria-labelledby="timeline-coverage-title">
            <h3 id="timeline-coverage-title">Cobertura e proveniência</h3>
            <ol aria-label="Linha temporal das observações">
              {comparison.observations.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong> — {item.period.startDate} a {item.period.endDate}; {item.coveredDays} dia(s) coberto(s); {item.coverageState}.
                  <details><summary>Proveniência</summary><ul>{item.provenance.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></details>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="timeline-values-title">
            <h3 id="timeline-values-title">Valores observados</h3>
            <p>diferença entre observações selecionadas</p>
            {comparison.state === 'INCOMPATIBLE' ? (
              <div role="alert"><p>Comparação incompatível.</p><ul>{comparison.reasons.map((reason) => <li key={`${reason.code}:${reason.message}`}>{reason.message}</li>)}</ul></div>
            ) : null}
            <div className="table-scroll" tabIndex={0} aria-label="Tabela rolável da comparação temporal">
              <table className="company-table" aria-label="Valores da comparação temporal">
                <thead><tr><th scope="col">Métrica</th>{comparison.observations.map((item) => <th scope="col" key={item.id}>{item.label}</th>)}<th scope="col">Diferenças adjacentes</th></tr></thead>
                <tbody>{comparison.metricRows.map((row) => (
                  <tr key={row.metricId}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((entry) => <td key={entry.observationId}>{formatValue(entry.value, row.unit)}</td>)}
                    <td>{row.deltas.length === 0 ? 'indisponível' : row.deltas.map((delta) => delta.value === undefined ? `indisponível: ${delta.unavailableReason}` : formatValue({ state: 'AVAILABLE', value: delta.value }, row.unit)).join(' · ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
