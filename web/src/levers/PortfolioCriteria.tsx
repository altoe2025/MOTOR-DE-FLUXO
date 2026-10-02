import { useEffect, useId, useState } from 'react';

import type { PortfolioFilters, PortfolioObjective } from './portfolioSelection';

export type CompanyChoice = Readonly<{ id: string; name: string }>;

const objectives: readonly { value: PortfolioObjective; label: string }[] = [
  { value: 'savings', label: 'Maior economia total' },
  { value: 'efficiency', label: 'Maior economia sobre o volume' },
  { value: 'costReduction', label: 'Maior redução do custo' },
  { value: 'wait', label: 'Menor espera média' },
  { value: 'companyCount', label: 'Menos empresas' },
  { value: 'netability', label: 'Maior netabilidade' },
];

type Props = Readonly<{
  objective: PortfolioObjective;
  filters: PortfolioFilters;
  errors: Partial<Record<keyof PortfolioFilters, string>>;
  companies: readonly CompanyChoice[];
  onObjectiveChange: (objective: PortfolioObjective) => void;
  onFiltersChange: (filters: PortfolioFilters) => void;
}>;

export function PortfolioCriteria({ objective, filters, errors, companies, onObjectiveChange, onFiltersChange }: Props) {
  const prefix = useId();
  const [companySearch, setCompanySearch] = useState('');
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const visibleCompanies = companies.filter(company => normalize(company.name).includes(normalize(companySearch.trim()))
    || company.id.toLowerCase().includes(companySearch.trim().toLowerCase()));
  const [maxCompaniesText, setMaxCompaniesText] = useState(filters.maxCompanies === null ? '' : String(filters.maxCompanies));
  useEffect(() => {
    if (filters.maxCompanies === null) setMaxCompaniesText('');
  }, [filters.maxCompanies]);
  const textField = (key: 'maxWaitDays' | 'minVolume' | 'minSavings' | 'retainBestPercent', label: string) => {
    const id = `${prefix}-${key}`;
    return <div key={key}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="decimal" value={filters[key] ?? ''} placeholder="Sem limite"
        aria-invalid={errors[key] !== undefined} aria-describedby={errors[key] ? `${id}-error` : undefined}
        onChange={(event) => onFiltersChange({ ...filters,
          [key]: event.target.value.trim() === '' ? null : event.target.value })} />
      {errors[key] ? <p id={`${id}-error`} role="alert">{errors[key]}</p> : null}
    </div>;
  };
  const companyErrorId = `${prefix}-companies-error`;
  return <div className="portfolio-criteria-content">
    <div className="portfolio-section-heading"><div><span className="eyebrow">01 / Critérios de escolha</span>
      <h3>O que significa melhor para você?</h3></div><span className="portfolio-badge">Atualização instantânea</span></div>
    <p className="field-hint">Escolha uma prioridade. As restrições definem quais carteiras podem entrar na recomendação.</p>
    <div className="portfolio-objective">
    <label htmlFor={`${prefix}-objective`}>Objetivo</label>
    <select id={`${prefix}-objective`} value={objective}
      onChange={(event) => onObjectiveChange(event.target.value as PortfolioObjective)}>
      {objectives.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <span className="field-hint">A classificação usa os resultados já calculados, sem executar o motor novamente.</span>
    </div>
    <fieldset>
      <legend>Restrições opcionais</legend>
      {textField('maxWaitDays', 'Espera média máxima (dias)')}
      {textField('minVolume', 'Volume mínimo (R$)')}
      {textField('minSavings', 'Economia mínima (R$)')}
      <div>
        <label htmlFor={`${prefix}-maxCompanies`}>Máximo de empresas</label>
        <input id={`${prefix}-maxCompanies`} type="text" inputMode="numeric" value={maxCompaniesText}
          aria-invalid={errors.maxCompanies !== undefined}
          aria-describedby={errors.maxCompanies ? `${prefix}-maxCompanies-error` : undefined}
          onChange={(event) => {
            setMaxCompaniesText(event.target.value);
            onFiltersChange({ ...filters, maxCompanies: event.target.value.trim() === '' ? null
              : /^[0-9]+$/.test(event.target.value) ? Number(event.target.value) : NaN });
          }} />
        {errors.maxCompanies ? <p id={`${prefix}-maxCompanies-error`} role="alert">{errors.maxCompanies}</p> : null}
      </div>
      {textField('retainBestPercent', 'Preservar percentual da melhor economia (%)')}
      <fieldset className="portfolio-companies" aria-describedby={errors.requiredCompanyIds ? companyErrorId : undefined}>
        <legend>Empresas obrigatórias</legend>
        <div className="portfolio-company-toolbar">
          <div><label htmlFor={`${prefix}-company-search`}>Buscar empresa</label>
            <input id={`${prefix}-company-search`} type="search" value={companySearch}
              placeholder="Nome ou identificador" onChange={event => setCompanySearch(event.target.value)} /></div>
          <span className="portfolio-badge">{filters.requiredCompanyIds.length} de {companies.length} obrigatórias</span>
        </div>
        <p className="field-hint">Fixe quem precisa participar. As demais empresas continuam livres para entrar ou sair.</p>
        <div className="portfolio-company-options">
        {visibleCompanies.map(company => <label className="portfolio-company-option" key={company.id}
          data-selected={filters.requiredCompanyIds.includes(company.id)}>
          <input type="checkbox" checked={filters.requiredCompanyIds.includes(company.id)}
            onChange={(event) => onFiltersChange({ ...filters, requiredCompanyIds: event.target.checked
              ? [...filters.requiredCompanyIds, company.id]
              : filters.requiredCompanyIds.filter(id => id !== company.id) })} />
          <span className="portfolio-company-avatar" aria-hidden="true">{company.name.slice(0, 2).toUpperCase()}</span>
          <span className="portfolio-company-copy"><strong>{company.name}</strong>
            {companies.some(other => other.id !== company.id && other.name === company.name) ? <small>ID: {company.id}</small> : null}
            <small aria-hidden="true">{filters.requiredCompanyIds.includes(company.id) ? 'Participação obrigatória' : 'Participação livre'}</small></span>
          <span className="portfolio-company-check" aria-hidden="true">{filters.requiredCompanyIds.includes(company.id) ? '✓' : '+'}</span>
        </label>)}
        </div>
        {visibleCompanies.length === 0 ? <p role="status">Nenhuma empresa encontrada. Tente outro nome.</p> : null}
        {errors.requiredCompanyIds ? <p id={companyErrorId} role="alert">{errors.requiredCompanyIds}</p> : null}
      </fieldset>
      {(objective === 'wait' || objective === 'companyCount')
        && (filters.retainBestPercent === null || filters.retainBestPercent.trim() === '')
        ? <button type="button" onClick={() => onFiltersChange({ ...filters, retainBestPercent: '95' })}>
          Preservar 95% da melhor economia
        </button> : null}
    </fieldset>
    <button type="button" onClick={() => onFiltersChange({ maxWaitDays: null, minVolume: null,
      minSavings: null, maxCompanies: null, requiredCompanyIds: [], retainBestPercent: null })}>Limpar filtros</button>
  </div>;
}
