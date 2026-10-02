import Decimal from 'decimal.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatBps, formatDecimal, formatFraction, formatMoney } from '../presentation/format';
import type { PortfolioMetrics } from './portfolioAnalysis';
import type { PortfolioSelection } from './portfolioSelection';

type SortKey = 'name' | 'companyCount' | 'savings' | 'efficiency' | 'costReduction' | 'volume' | 'wait' | 'waitP95Days' | 'netability' | 'status';
type Props = Readonly<{
  candidates: readonly PortfolioMetrics[];
  ineligible: PortfolioSelection['ineligible'];
  selectedScenarioId: string | null;
  onSelect: (scenarioId: string | null) => void;
  linkFor: (scenarioId: string) => string;
  resetKey?: string;
  invalidFilters?: boolean;
  showIneligible: boolean;
  onShowIneligibleChange: (show: boolean) => void;
}>;

const reasonLabels: Readonly<Record<string, string>> = {
  volume: 'Volume medido indisponível',
  maxWaitDays: 'Espera média acima do limite',
  minVolume: 'Volume abaixo do mínimo',
  minSavings: 'Economia abaixo do mínimo',
  maxCompanies: 'Mais empresas que o máximo',
  requiredCompanyIds: 'Empresa obrigatória ausente',
  retainBestPercent: 'Abaixo do percentual da melhor economia',
  baseline: 'Custo base zero; redução percentual indisponível',
};

const headings: readonly [SortKey, string][] = [
  ['name', 'Composição'], ['companyCount', 'Empresas'], ['savings', 'Economia R$'],
  ['efficiency', 'Economia %/bps'], ['costReduction', 'Redução do custo'],
  ['volume', 'Volume'], ['wait', 'Espera média'], ['waitP95Days', 'Espera P95'],
  ['netability', 'Netabilidade'], ['status', 'Atende aos filtros'],
];

function ratio(numerator: string, denominator: string): Decimal | null {
  if (new Decimal(denominator).isZero()) return null;
  const Exact = Decimal.clone({ precision: numerator.length + denominator.length + 10 });
  return new Exact(numerator).div(denominator);
}

function compare(left: PortfolioMetrics, right: PortfolioMetrics, key: SortKey, exclusions: ReadonlyMap<string, readonly string[]>): number {
  const numeric = (a: string, b: string) => new Decimal(a).comparedTo(b);
  const fractions = (a: string, b: string, c: string, d: string) => {
    if (new Decimal(b).isZero()) return new Decimal(d).isZero() ? 0 : 1;
    if (new Decimal(d).isZero()) return -1;
    const Exact = Decimal.clone({ precision: a.length + b.length + c.length + d.length + 10 });
    return new Exact(a).times(d).comparedTo(new Exact(c).times(b));
  };
  switch (key) {
    case 'name': return left.name.localeCompare(right.name, 'pt-BR');
    case 'companyCount': return left.companyIds.length - right.companyIds.length;
    case 'savings': return numeric(left.savings, right.savings);
    case 'efficiency': return fractions(left.savings, left.volume, right.savings, right.volume);
    case 'costReduction': return fractions(left.savings, left.baseline, right.savings, right.baseline);
    case 'volume': return numeric(left.volume, right.volume);
    case 'wait': return fractions(left.weightedWait, left.volume, right.weightedWait, right.volume);
    case 'waitP95Days': return left.waitP95Days - right.waitP95Days;
    case 'netability': return numeric(left.netability, right.netability);
    case 'status': return Number(exclusions.has(left.scenarioId)) - Number(exclusions.has(right.scenarioId));
  }
}

export function PortfolioTable({ candidates, ineligible, selectedScenarioId, onSelect, linkFor, resetKey, invalidFilters = false, showIneligible, onShowIneligibleChange }: Props) {
  const [sort, setSort] = useState<SortKey>('savings');
  const [descending, setDescending] = useState(true);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selectionNotice, setSelectionNotice] = useState(false);
  useEffect(() => { setPage(0); }, [resetKey]);
  const exclusions = useMemo(() => new Map(ineligible.map(item => [item.candidate.scenarioId, item.reasons])), [ineligible]);
  useEffect(() => {
    if (!showIneligible && selectedScenarioId !== null && exclusions.has(selectedScenarioId)) {
      onSelect(null);
      setSelectionNotice(true);
    } else if (selectedScenarioId !== null && candidates.some(row => row.scenarioId === selectedScenarioId)) {
      setSelectionNotice(false);
    }
  }, [candidates, exclusions, onSelect, selectedScenarioId, showIneligible]);
  const sorted = useMemo(() => candidates.filter(row => showIneligible || !exclusions.has(row.scenarioId))
    .sort((left, right) => (descending ? -1 : 1) * compare(left, right, sort, exclusions)
      || left.scenarioId.localeCompare(right.scenarioId)), [candidates, descending, exclusions, showIneligible, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const sortBy = (key: SortKey) => {
    setDescending(key === sort ? !descending : key !== 'name');
    setSort(key);
    setPage(0);
  };
  return <section aria-label="Tabela de composições">
    <p>A ordenação da tabela não muda o objetivo da recomendação.</p>
    <label><input type="checkbox" checked={showIneligible} onChange={event => { onShowIneligibleChange(event.target.checked); setPage(0); }} /> Mostrar também as composições fora dos filtros</label>
    {selectionNotice ? <p role="status">A seleção foi removida porque a composição não está visível com estes filtros.</p> : null}
    <label>Linhas por página <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>
      {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
    </select></label>
    <div className="table-scroll" role="region" tabIndex={0} aria-label="Todas as composições avaliadas">
      <table className="company-table">
        <caption>Todas as composições avaliadas ({sorted.length})</caption>
        <thead><tr>{headings.map(([key, label]) => <th key={key} scope="col" aria-sort={sort === key ? descending ? 'descending' : 'ascending' : undefined}>
          <button type="button" onClick={() => sortBy(key)} aria-label={`Ordenar por ${label.toLowerCase()}`}>{label}</button>
        </th>)}<th scope="col">Análise</th></tr></thead>
        <tbody>{visible.map(row => {
          const reasons = exclusions.get(row.scenarioId);
          const efficiency = ratio(row.savings, row.volume);
          const reduction = ratio(row.savings, row.baseline);
          const wait = ratio(row.weightedWait, row.volume);
          return <tr key={row.scenarioId} aria-selected={selectedScenarioId === row.scenarioId}>
            <th scope="row"><Link to={linkFor(row.scenarioId)}>{row.name}</Link>
              <small>{row.companyNames.map((name, index) => `${name} (${row.companyIds[index]})`).join(', ')}</small>
              {row.companyIdentitySource === 'LEGACY' ? <small>Identificação legada por nome</small> : null}
              {row.companyIdentitySource === 'MIXED' ? <small>Identificação mista: cadastro e nome legado</small> : null}
            </th>
            <td>{row.companyIds.length}</td><td>{formatMoney(row.savings)}</td>
            <td>{efficiency === null ? 'Não disponível' : <>{formatFraction(efficiency.toFixed())} / {formatBps(efficiency.times(10000).toFixed())}</>}</td>
            <td>{reduction === null ? 'Não disponível' : formatFraction(reduction.toFixed())}</td>
            <td>{formatMoney(row.volume)}</td>
            <td>{wait === null ? 'Não disponível' : `${formatDecimal(wait.toFixed(), 2)} dias`}</td>
            <td>{row.waitP95Days} dias</td><td>{formatFraction(row.netability)}</td>
            <td>{invalidFilters ? 'Critérios inválidos' : reasons === undefined ? 'Atende'
              : `Não atende: ${reasons.map(reason => reasonLabels[reason] ?? reason).join(', ')}`}</td>
            <td><button type="button" onClick={() => { setSelectionNotice(false); onSelect(row.scenarioId); }}>Selecionar {row.name}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p>Página {currentPage + 1} de {pages}; {sorted.length} composições.</p>
    <button type="button" disabled={currentPage === 0} onClick={() => setPage(0)}>Primeira página</button>
    <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Página anterior</button>
    <button type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Próxima página</button>
    <button type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(pages - 1)}>Última página</button>
  </section>;
}
