import Decimal from 'decimal.js';
import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { formatBpsAsPercent, formatDecimal, formatMoney } from '../presentation/format';
import type { PortfolioMetrics } from './portfolioAnalysis';
import { portfolioMarginals, type MarginalRow } from './portfolioMarginal';

export type PortfolioMarginalPanelProps = Readonly<{
  allComparable: readonly PortfolioMetrics[];
  selectedScenarioId: string | null;
  universeCompanyIds: readonly string[];
  eligibilityByScenarioId?: ReadonlyMap<string, boolean>;
  onSelect: (scenarioId: string) => void;
  scenarioHref: (scenarioId: string) => string;
}>;

type Formatter = (value: string | null) => string;
const unavailable = 'Não disponível';
const days: Formatter = value => value === null ? unavailable : `${formatDecimal(value, 2)} dias`;
const percentagePoints: Formatter = value => value === null ? unavailable : formatBpsAsPercent(value).replace('%', ' p.p.');
const count: Formatter = value => value ?? unavailable;

function signed(value: string | null, format: Formatter): string {
  if (value === null) return unavailable;
  const decimal = new Decimal(value);
  const sign = decimal.isZero() ? '' : decimal.isNegative() ? '-' : '+';
  return `${sign}${format(decimal.abs().toFixed())}`;
}

function Difference({ before, after, delta, format, deltaFormat = format }: Readonly<{
  before: string | null; after: string | null; delta: string | null; format: Formatter; deltaFormat?: Formatter;
}>) {
  return <td>
    <div>Antes: {format(before)}</div>
    <div>Depois: {format(after)}</div>
    <strong>Δ: {signed(delta, deltaFormat)}</strong>
  </td>;
}

function SavingsBars({ rows, labelId, onSelect, eligibilityByScenarioId }: Readonly<{
  rows: readonly MarginalRow[]; labelId: string; onSelect: (id: string) => void;
  eligibilityByScenarioId: ReadonlyMap<string, boolean> | undefined;
}>) {
  const available = rows.filter(row => row.savingsDelta !== null);
  if (available.length === 0) return null;
  const largest = available.reduce((maximum, row) => Decimal.max(maximum, new Decimal(row.savingsDelta!).abs()), new Decimal(0));
  return <figure className="portfolio-marginal-chart" aria-labelledby={labelId}>
    <figcaption id={labelId}>Variação da economia (R$)</figcaption>
    <p className="field-hint">Uma empresa por vez. Barras na mesma escala: redução à esquerda, aumento à direita.</p>
    <ul>{available.map(row => {
      const value = new Decimal(row.savingsDelta!);
      // Number is used only for SVG geometry; displayed values retain decimal strings.
      const width = largest.isZero() ? 0 : value.abs().div(largest).times(48).toNumber();
      const homonymous = rows.some(other => other.companyId !== row.companyId && other.companyName === row.companyName);
      return <li key={row.companyId} data-impact={value.isNegative() ? 'negative' : value.isZero() ? 'neutral' : 'positive'}>
        <div className="portfolio-impact-heading">
          <div><span className="portfolio-impact-action">{row.action === 'REMOVE' ? '− Remover' : '+ Adicionar'}</span>
            <strong>{row.companyName}</strong>{homonymous ? <small>ID: {row.companyId}</small> : null}</div>
          <div className="portfolio-impact-value"><strong>{signed(row.savingsDelta, formatMoney)}</strong>
            <small>{value.isNegative() ? 'Redução da economia' : value.isZero() ? 'Sem alteração da economia' : 'Aumento da economia'}</small></div>
        </div>
        <div className="portfolio-impact-track" aria-hidden="true">
          <svg viewBox="0 0 100 8" width="100%" height="24" preserveAspectRatio="none">
            <line x1="50" x2="50" y1="0" y2="8" stroke="var(--muted)" strokeWidth="0.2" />
            <rect x={value.isNegative() ? 50 - width : 50} y="2" width={width} height="4" rx="0.8"
              fill={value.isNegative() ? 'var(--error)' : 'var(--accent)'} />
          </svg>
        </div>
        <div className="portfolio-impact-footer"><span>Variação da espera: <strong>{signed(row.weightedMeanWaitDelta, days)}</strong></span>
          {row.targetScenarioId ? <button type="button" onClick={() => onSelect(row.targetScenarioId!)}>
            Ver efeito de {row.action === 'REMOVE' ? 'remover' : 'adicionar'} {row.companyName}{homonymous ? ` (ID: ${row.companyId})` : ''} ↗
          </button> : null}</div>
        {row.targetScenarioId && eligibilityByScenarioId?.get(row.targetScenarioId) === false
          ? <small className="field-hint">Resultado fora dos filtros atuais; disponível para análise.</small> : null}
      </li>;
    })}</ul>
  </figure>;
}

export function PortfolioMarginalPanel({
  allComparable, selectedScenarioId, universeCompanyIds, eligibilityByScenarioId, onSelect, scenarioHref,
}: PortfolioMarginalPanelProps) {
  const id = useId();
  const selected = allComparable.find(candidate => candidate.scenarioId === selectedScenarioId);
  const rows = useMemo(() => selectedScenarioId === null ? []
    : portfolioMarginals(allComparable, selectedScenarioId, universeCompanyIds), [allComparable, selectedScenarioId, universeCompanyIds]);
  const byScenario = new Map(allComparable.map(candidate => [candidate.scenarioId, candidate]));

  return <section className="portfolio-marginal" aria-labelledby={`${id}-title`}>
    <span className="eyebrow">05 / Impacto na composição</span>
    <h3 id={`${id}-title`}>Contribuição marginal{selected === undefined ? '' : `: ${selected.name}`}</h3>
    {selected ? <div className="portfolio-marginal-base"><span>Composição em análise</span><strong>{selected.name}</strong>
      <span>{selected.companyIds.length} empresas · {formatMoney(selected.savings)} de economia</span></div> : null}
    <p>Os efeitos dependem da composição selecionada, não são aditivos e não representam rateio,
      lucro atribuível ou benefício próprio de uma empresa. Cada delta é o resultado da contraparte menos o da selecionada.</p>
    <p className="field-hint">Os custos das empresas fora da composição não entram nesta comparação.
      A espera é a média ponderada pelo volume; seu delta não representa um prazo máximo.</p>
    {selected === undefined ? <p>Selecione uma composição atual comparável para analisar adições e remoções.</p> : <>
      <SavingsBars rows={rows} labelId={`${id}-bars`} onSelect={onSelect} eligibilityByScenarioId={eligibilityByScenarioId} />
      {rows.some(row => row.savingsDelta === null) ? <p role="note">Alguns efeitos não têm resultado comparável. Consulte os motivos nos detalhes.</p> : null}
      <details className="portfolio-marginal-details"><summary>Ver todos os valores: antes, depois e diferença</summary>
      <div className="table-scroll" role="region" tabIndex={0} aria-label="Tabela de contribuição marginal">
        <table className="company-table">
          <caption>Efeito de adicionar ou remover empresas — antes, depois e diferença</caption>
          <thead><tr>
            <th scope="col">Ação e empresa</th><th scope="col">Economia (R$)</th>
            <th scope="col">Economia sobre volume (%)</th><th scope="col">Volume (R$)</th>
            <th scope="col">Espera média (dias)</th><th scope="col">Empresas</th><th scope="col">Contraparte</th>
          </tr></thead>
          <tbody>{rows.map(row => {
            const target = row.targetScenarioId === null ? undefined : byScenario.get(row.targetScenarioId);
            const targetName = target === undefined ? '' : allComparable.some(candidate =>
              candidate.name === target.name && candidate.scenarioId !== target.scenarioId)
              ? `${target.name} (ID: ${target.scenarioId})` : target.name;
            return <tr key={row.companyId}>
              <th scope="row">{row.action === 'REMOVE' ? 'Remover' : 'Adicionar'} {row.companyName}{' '}<small>ID: {row.companyId}</small></th>
              <Difference before={row.before?.savings ?? null} after={row.after?.savings ?? null} delta={row.savingsDelta} format={formatMoney} />
              <Difference before={row.before?.bps ?? null} after={row.after?.bps ?? null} delta={row.bpsDelta} format={formatBpsAsPercent} deltaFormat={percentagePoints} />
              <Difference before={row.before?.volume ?? null} after={row.after?.volume ?? null} delta={row.volumeDelta} format={formatMoney} />
              <Difference before={row.before?.weightedMeanWait ?? null} after={row.after?.weightedMeanWait ?? null} delta={row.weightedMeanWaitDelta} format={days} />
              <Difference before={row.before === null ? null : String(row.before.companyCount)} after={row.after === null ? null : String(row.after.companyCount)}
                delta={row.companyCountDelta === null ? null : String(row.companyCountDelta)} format={count} />
              <td>{target === undefined ? row.reason : <>
                <div>{targetName}</div>
                {eligibilityByScenarioId?.get(target.scenarioId) === false ? <p>Contraparte fora dos filtros; resultado atual comparável.</p> : null}
                <button type="button" onClick={() => onSelect(target.scenarioId)}>Analisar composição {targetName}</button>{' '}
                <Link to={scenarioHref(target.scenarioId)}>Abrir composição {targetName}</Link>
              </>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      </details>
    </>}
  </section>;
}
