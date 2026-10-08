import Decimal from 'decimal.js';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatDecimal, formatMoney, formatSignedMoney } from '../presentation/format';
import type { StudyDocument } from '../study/model';
import { PortfolioCriteria, type CompanyChoice } from './PortfolioCriteria';
import { PortfolioMarginalPanel } from './PortfolioMarginalPanel';
import { PortfolioSelectionDetails } from './PortfolioSelectionDetails';
import { collectPortfolioMetrics, collectPortfolioMetricsCooperatively, type PortfolioDataset, type PortfolioMetrics } from './portfolioAnalysis';
import { emptyFilters, selectPortfolios, type PortfolioFilters, type PortfolioObjective, type SelectablePortfolio } from './portfolioSelection';

const highlightLabels: readonly [PortfolioObjective, string][] = [
  ['savings', 'Maior economia'], ['efficiency', 'Maior eficiência sobre volume'],
  ['wait', 'Menor espera'], ['companyCount', 'Menor composição'],
];
const deferredDataset: PortfolioDataset = { candidates: [], excluded: [], preparedCount: 0, complete: false };
type CachedProjection = Readonly<{
  revision: number;
  value: PortfolioDataset | Promise<PortfolioDataset>;
}>;
const projectedDatasets = new WeakMap<StudyDocument, CachedProjection>();
const cooperativeProjectionThreshold = 16;

function projectionFor(study: StudyDocument): PortfolioDataset | Promise<PortfolioDataset> {
  const cached = projectedDatasets.get(study);
  if (cached?.revision === study.revision) return cached.value;
  const revision = study.revision;
  const value = study.scenarios.length > cooperativeProjectionThreshold
    ? collectPortfolioMetricsCooperatively(study) : collectPortfolioMetrics(study);
  projectedDatasets.set(study, { revision, value });
  if (value instanceof Promise) {
    void value.then((dataset) => {
      const current = projectedDatasets.get(study);
      if (current?.revision === revision && current.value === value) {
        projectedDatasets.set(study, { revision, value: dataset });
      }
    }, () => {
      const current = projectedDatasets.get(study);
      if (current?.revision === revision && current.value === value) projectedDatasets.delete(study);
    });
  }
  return value;
}

type SettledProjection = Readonly<{
  study: StudyDocument;
  revision: number;
  dataset: PortfolioDataset | null;
  error: unknown;
}>;

function usePortfolioDataset(study: StudyDocument, deferred: boolean): PortfolioDataset | null {
  const revision = study.revision;
  const projection = useMemo(() => deferred ? deferredDataset : projectionFor(study), [deferred, study, revision]);
  const [settled, setSettled] = useState<SettledProjection | null>(null);
  useEffect(() => {
    if (!(projection instanceof Promise)) return;
    let active = true;
    void projection.then(
      dataset => { if (active) setSettled({ study, revision, dataset, error: null }); },
      error => { if (active) setSettled({ study, revision, dataset: null, error }); },
    );
    return () => { active = false; };
  }, [projection, revision, study]);
  if (!(projection instanceof Promise)) return projection;
  if (settled?.study !== study || settled.revision !== revision) return null;
  if (settled.error !== null) throw settled.error;
  return settled.dataset;
}

function companyChoices(rows: readonly PortfolioMetrics[]): CompanyChoice[] {
  const names = new Map<string, string>();
  for (const row of rows) row.companyIds.forEach((id, index) => names.set(id, row.companyNames[index] ?? id));
  return [...names].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR') || left.id.localeCompare(right.id));
}

function waitDays(row: SelectablePortfolio): string {
  const Exact = Decimal.clone({ precision: row.weightedWait.length + row.volume.length + 10 });
  return `${formatDecimal(new Exact(row.weightedWait).div(row.volume).toFixed(), 2)} dias`;
}

function savingsPercent(row: SelectablePortfolio): string {
  const Exact = Decimal.clone({ precision: row.savings.length + row.volume.length + 10 });
  return `${formatDecimal(new Exact(row.savings).div(row.volume).times(100).toFixed(), 2)}%`;
}

function signed(value: Decimal, digits: number): string {
  return `${value.gt(0) ? '+' : ''}${formatDecimal(value.toFixed(), digits)}`;
}

function comparisonExplanation(winner: SelectablePortfolio, alternative: SelectablePortfolio): string {
  const values = [winner.savings, winner.volume, winner.baseline, winner.weightedWait,
    winner.netability, alternative.savings, alternative.volume, alternative.baseline,
    alternative.weightedWait, alternative.netability];
  const Exact = Decimal.clone({ precision: values.reduce((total, value) => total + value.length, 20) });
  const savings = new Exact(winner.savings).minus(alternative.savings);
  const efficiency = new Exact(winner.savings).div(winner.volume).minus(new Exact(alternative.savings).div(alternative.volume)).times(100);
  const wait = new Exact(winner.weightedWait).div(winner.volume).minus(new Exact(alternative.weightedWait).div(alternative.volume));
  const reduction = new Exact(winner.baseline).isZero() || new Exact(alternative.baseline).isZero()
    ? 'redução do custo indisponível'
    : `redução do custo ${signed(new Exact(winner.savings).div(winner.baseline)
      .minus(new Exact(alternative.savings).div(alternative.baseline)).times(100), 2)} p.p.`;
  const netability = new Exact(winner.netability).minus(alternative.netability).times(100);
  const companies = winner.companyIds.length - alternative.companyIds.length;
  return `Frente à alternativa ${alternative.name}: economia ${formatSignedMoney(savings.toFixed())}; economia sobre volume ${signed(efficiency, 2)} p.p.; ${reduction}; espera ${signed(wait, 2)} dias; ${companies > 0 ? '+' : ''}${companies} empresas; netabilidade ${signed(netability, 2)} p.p.`;
}

export function PortfolioRecommendation({ study, deferred = false }: Readonly<{ study: StudyDocument; deferred?: boolean }>) {
  return <PortfolioRecommendationForStudy key={study.id} study={study} deferred={deferred} />;
}

function PortfolioRecommendationForStudy({ study, deferred }: Readonly<{ study: StudyDocument; deferred: boolean }>) {
  const titleId = useId();
  const [objective, setObjective] = useState<PortfolioObjective>('savings');
  const [filters, setFilters] = useState<PortfolioFilters>(emptyFilters);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const dataset = usePortfolioDataset(study, deferred);
  const visibleDataset = dataset ?? deferredDataset;
  const companies = useMemo(() => companyChoices(visibleDataset.candidates), [visibleDataset]);
  const selection = useMemo(() => selectPortfolios(visibleDataset.candidates, objective, filters), [visibleDataset, objective, filters]);
  const eligible = useMemo(() => {
    const byId = new Map(visibleDataset.candidates.map(row => [row.scenarioId, row]));
    return selection.ranked.flatMap(row => {
      const candidate = byId.get(row.scenarioId);
      return candidate ? [candidate] : [];
    });
  }, [visibleDataset, selection]);
  const universeCompanyIds = useMemo(() => companies.map(company => company.id), [companies]);
  const eligibilityByScenarioId = useMemo(() => {
    const ids = new Set(eligible.map(row => row.scenarioId));
    return new Map(visibleDataset.candidates.map(row => [row.scenarioId, ids.has(row.scenarioId)]));
  }, [visibleDataset, eligible]);
  if (dataset === null) return <section className="savings-origin portfolio-analysis" aria-labelledby={titleId}>
    <h2 id={titleId}>Qual carteira atende melhor?</h2>
    <p role="status">Preparando a recomendação…</p>
  </section>;
  if (deferred) return <section className="savings-origin portfolio-analysis" aria-labelledby={titleId}>
    <h2 id={titleId}>Qual carteira atende melhor?</h2>
    <p role="status">A recomendação será atualizada após o lote.</p>
  </section>;
  const hasErrors = Object.keys(selection.errors).length > 0;
  const hasRelativeTarget = filters.retainBestPercent !== null && filters.retainBestPercent.trim() !== '';
  const winner = selection.winner;
  const runnerUp = selection.ranked[1];
  const selected = dataset.candidates.find(row => row.scenarioId === selectedScenarioId);
  const detailSelection = selected ?? dataset.candidates.find(row => row.scenarioId === winner?.scenarioId);
  const selectForAnalysis = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
  };
  const highlights = new Map<string, string[]>();
  for (const [key, label] of highlightLabels) {
    const id = selection.highlights[key];
    if (id !== null) highlights.set(id, [...(highlights.get(id) ?? []), label]);
  }
  const link = (scenarioId: string) => `/estudos/${encodeURIComponent(study.id)}/diagnostico?scenarioId=${encodeURIComponent(scenarioId)}`;

  return <section className="savings-origin portfolio-analysis" aria-labelledby={titleId}>
    <h2 id={titleId}>Qual carteira atende melhor?</h2>
    <dl className="portfolio-overview">
      <div><dt>Carteiras preparadas</dt><dd>{dataset.preparedCount}</dd></div>
      <div><dt>Comparáveis atuais</dt><dd>{dataset.candidates.length}</dd></div>
      <div><dt>Atendem aos critérios</dt><dd>{selection.ranked.length}</dd></div>
      <div><dt>Excluídas tecnicamente</dt><dd>{dataset.excluded.length}</dd></div>
    </dl>
    <p className="portfolio-coverage">{dataset.complete ? 'Todas as combinações únicas da carteira atual foram avaliadas.' : 'A busca ainda não cobre todas as combinações únicas da carteira atual.'}</p>
    <div className="portfolio-criteria"><PortfolioCriteria objective={objective} filters={filters} errors={selection.errors} companies={companies}
      onObjectiveChange={setObjective} onFiltersChange={setFilters} /></div>
    {selection.relativeReference !== null && hasRelativeTarget
      ? <p>Melhor economia após restrições absolutas: {formatMoney(selection.relativeReference)} entre {selection.relativeReferenceUniverseCount} carteiras.</p> : null}
    {selection.relativeUnavailableReason ? <p role="note">{selection.relativeUnavailableReason}</p> : null}
    {(objective === 'wait' || objective === 'companyCount') && !hasRelativeTarget
      ? <p>Sem meta de economia, a escolha pode produzir pouca economia.</p> : null}
    <div className="portfolio-recommendation" aria-live="polite">
      {hasErrors ? <p>Corrija os campos indicados para receber uma recomendação.</p>
        : winner === null ? <p>{dataset.candidates.length === 0
          ? 'Ainda não há carteiras comparáveis com diagnóstico atual. Execute os cenários para avaliar as composições.'
          : 'Nenhuma carteira atende aos filtros. Limpe ou ajuste as restrições para ver uma recomendação.'}</p>
          : <>
            <div className="portfolio-section-heading"><span className="eyebrow">02 / Melhor para seus critérios</span>
              <span className="portfolio-badge">{winner.companyIds.length} empresas</span></div>
            <h3>Composição recomendada: {winner.name}</h3>
            {new Decimal(winner.savings).lte(0) ? <p role="note">Mesmo a melhor composição avaliada não reduz o custo em relação à execução sem pool.</p> : null}
            <dl className="portfolio-winner-metrics">
              <div className="portfolio-primary-metric"><dt>Economia total</dt><dd>{formatMoney(winner.savings)}</dd></div>
              <div><dt>Economia sobre volume</dt><dd>{savingsPercent(winner)}</dd></div>
              <div><dt>Espera média</dt><dd>{waitDays(winner)}</dd></div>
              <div><dt>Volume medido</dt><dd>{formatMoney(winner.volume)}</dd></div>
              {objective === 'netability' ? <div><dt>Netabilidade</dt>
                <dd>{formatDecimal(new Decimal(winner.netability).times(100).toFixed(), 2)}%</dd></div> : null}
              {objective === 'costReduction' ? <div><dt>Redução do custo</dt>
                <dd>{new Decimal(winner.baseline).isZero() ? 'Não disponível' : savingsPercent({ ...winner, volume: winner.baseline })}</dd></div> : null}
            </dl>
            <div className="portfolio-company-chips" aria-label="Empresas da composição recomendada">
              {winner.companyNames.map((name, index) => <span title={winner.companyIds[index]} key={winner.companyIds[index]}>{name}
                {companies.some(company => company.name === name && company.id !== winner.companyIds[index]) ? ` (${winner.companyIds[index]})` : ''}</span>)}
            </div>
            <div className="portfolio-winner-footer">
              <Link className="button" to={link(winner.scenarioId)}>Abrir composição</Link>
              {selected ? <button type="button" onClick={() => setSelectedScenarioId(null)}>Analisar recomendação atual</button> : null}
              {runnerUp ? <details><summary>Comparar com a próxima alternativa</summary><p>{comparisonExplanation(winner, runnerUp)}</p></details> : null}
            </div>
          </>}
    </div>
    <p className="field-hint">Melhores entre as carteiras avaliadas e comparáveis; os custos das empresas fora da composição não entram nesta comparação.</p>
    {highlights.size > 0 ? <section aria-label="Alternativas em destaque" className="portfolio-alternatives">
      <span className="eyebrow">03 / Outras prioridades</span><h3>Alternativas em destaque</h3>
      <p className="field-hint">Explore os destaques de cada objetivo. Selecionar uma alternativa muda a análise abaixo, não os seus critérios.</p><ul>
      {[...highlights].map(([id, labels], index) => {
        const row = dataset.candidates.find(item => item.scenarioId === id);
        if (!row) return null;
        const displayName = dataset.candidates.some(item => item.scenarioId !== id && item.name === row.name)
          ? `${row.name} (ID: ${id})` : row.name;
        const outsideActiveCriteria = eligibilityByScenarioId.get(id) === false;
        const exclusion = selection.ineligible.find(item => item.candidate.scenarioId === id);
        const noteId = `${titleId}-highlight-${index}`;
        return <li key={id} data-selected={detailSelection?.scenarioId === id}>
          <div className="portfolio-alternative-label">{labels.join(' · ')}</div>
          <button type="button" aria-pressed={detailSelection?.scenarioId === id}
          aria-describedby={outsideActiveCriteria ? noteId : undefined}
          onClick={() => selectForAnalysis(id)}>{displayName}</button>
          <dl className="portfolio-alternative-metrics">
            <div><dt>Economia</dt><dd>{formatMoney(row.savings)}</dd></div>
            <div><dt>Sobre volume</dt><dd>{savingsPercent(row)}</dd></div>
            <div><dt>Espera média</dt><dd>{waitDays(row)}</dd></div>
          </dl>
          <span className="portfolio-alternative-state">{detailSelection?.scenarioId === id ? 'Em análise ↓' : 'Selecionar para analisar ↗'}</span>
          {outsideActiveCriteria ? <p id={noteId} role="note">Fora do objetivo ou dos filtros ativos.
            {exclusion?.reasons.includes('baseline') ? ' Custo sem pool zero; redução percentual indisponível.' : ' Não atende às restrições desta recomendação.'}
            {' '}Disponível para análise independente.</p> : null}
        </li>;
      })}
    </ul></section> : null}
    {selected ? <p>Composição selecionada: {selected.name}. <Link to={link(selected.scenarioId)}>Abrir composição selecionada</Link></p> : null}
    {detailSelection ? <>
      {!selected ? <p className="field-hint">Os detalhes e efeitos abaixo usam a recomendação atual. Use as alternativas ou a contribuição marginal para explorar outra composição.</p> : null}
      {eligibilityByScenarioId.get(detailSelection.scenarioId) === false
        ? <p role="note">A composição em análise não atende aos critérios atuais; seu resultado continua disponível para consulta.</p> : null}
      <PortfolioSelectionDetails selected={detailSelection} />
    </> : null}
    <PortfolioMarginalPanel allComparable={dataset.candidates} selectedScenarioId={detailSelection?.scenarioId ?? null}
      universeCompanyIds={universeCompanyIds} eligibilityByScenarioId={eligibilityByScenarioId}
      onSelect={selectForAnalysis} scenarioHref={link} />
    {dataset.excluded.length > 0 ? <details><summary>Exclusões técnicas ({dataset.excluded.length})</summary><ul>
      {dataset.excluded.map(row => <li key={row.scenarioId}><strong>{row.name}:</strong> {row.reason}</li>)}
    </ul></details> : null}
  </section>;
}
