// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { PortfolioMetrics } from './portfolioAnalysis';
import { PortfolioMarginalPanel } from './PortfolioMarginalPanel';

function fixture(): PortfolioMetrics[] {
  return [
    { scenarioId: 'AB', companyIds: ['A', 'B'], savings: '100', volume: '10000', weightedWait: '20000' },
    { scenarioId: 'A', companyIds: ['A'], savings: '30', volume: '4000', weightedWait: '4000' },
    { scenarioId: 'B', companyIds: ['B'], savings: '20', volume: '6000', weightedWait: '18000' },
    { scenarioId: 'ABC', companyIds: ['A', 'B', 'C'], savings: '120', volume: '15000', weightedWait: '45000' },
  ].map(row => ({ ...row, name: row.scenarioId, companyNames: row.companyIds.map(() => 'Homônima'),
    baseline: '200', netted: '100', waitP95Days: 4, matchedVolume: '0', netability: '0',
    costDelta: { iof: row.savings, carry: '0', spread: '0', espera: '0', fixo: '0' } }));
}

function Subject({ candidates = fixture(), initial = 'AB' }: { candidates?: PortfolioMetrics[]; initial?: string }) {
  const [selected, setSelected] = useState(initial);
  return <MemoryRouter><PortfolioMarginalPanel allComparable={candidates} selectedScenarioId={selected}
    universeCompanyIds={['A', 'B', 'C']} eligibilityByScenarioId={new Map([['ABC', false]])}
    onSelect={setSelected} scenarioHref={id => `/composicao/${id}`} /></MemoryRouter>;
}

describe('PortfolioMarginalPanel', () => {
  it('shows before, after and signed deltas with a table equivalent to the divergent savings bars', () => {
    render(<Subject />);
    const table = screen.getByRole('table', { name: /Efeito de adicionar ou remover empresas/ });
    const removeB = within(table).getByRole('row', { name: /Remover Homônima ID: B/ });
    expect(removeB).toHaveTextContent(/Antes: R\$\s100,00/);
    expect(removeB).toHaveTextContent(/Depois: R\$\s30,00/);
    expect(removeB).toHaveTextContent(/Δ: -R\$\s70,00/);
    expect(removeB).toHaveTextContent(/Δ: -25,00 bps/);
    expect(removeB).toHaveTextContent(/Δ: -1,00 dias/);
    const addC = within(table).getByRole('row', { name: /Adicionar Homônima ID: C/ });
    expect(addC).toHaveTextContent(/Δ: \+R\$\s20,00/);
    expect(addC).toHaveTextContent(/Contraparte fora dos filtros/);
    expect(within(addC).getByRole('link', { name: /Abrir composição ABC/ })).toHaveAttribute('href', '/composicao/ABC');
    expect(screen.getByRole('figure', { name: /Variação da economia/ })).toHaveTextContent(/-R\$\s70,00/);
    expect(screen.getByText(/não são aditivos/)).toHaveTextContent(/não representam rateio/);
  });

  it('updates the analysis when a counterpart is selected', async () => {
    render(<Subject />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Analisar composição A' }));
    expect(screen.getByRole('heading', { name: 'Contribuição marginal: A' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Efeito de adicionar ou remover empresas/ });
    expect(within(table).getByRole('row', { name: /Remover Homônima ID: A/ })).toHaveTextContent(/Carteira vazia não avaliada/);
    expect(within(table).getByRole('row', { name: /Adicionar Homônima ID: B/ })).toHaveTextContent(/Δ: \+R\$\s70,00/);
  });

  it('keeps missing counterparts unavailable with no invented zero or navigation', () => {
    render(<Subject candidates={[fixture()[0]!]} />);
    const table = screen.getByRole('table', { name: /Efeito de adicionar ou remover empresas/ });
    expect(within(table).getAllByText(/Contraparte sem resultado atual comparável/)).toHaveLength(3);
    expect(within(table).queryByRole('link')).not.toBeInTheDocument();
    expect(within(table).queryByText(/R\$\s0,00/)).not.toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('hides all before values for contradictory selected sets in either input order', () => {
    const candidates = fixture();
    candidates.push({ ...candidates[0]!, scenarioId: 'AB-conflict', savings: '999' });
    const { rerender } = render(<Subject candidates={candidates} />);
    const table = screen.getByRole('table', { name: /Efeito de adicionar ou remover empresas/ });
    expect(within(table).getAllByText('Antes: Não disponível')).toHaveLength(15);
    expect(within(table).queryByText(/Antes: R\$/)).not.toBeInTheDocument();
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
    const text = table.textContent;
    rerender(<Subject candidates={[...candidates].reverse()} />);
    expect(screen.getByRole('table', { name: /Efeito de adicionar ou remover empresas/ }).textContent).toBe(text);
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('distinguishes homonymous counterpart destinations visibly and in accessible action names', async () => {
    const candidates = fixture().map(candidate => candidate.scenarioId === 'A' || candidate.scenarioId === 'B'
      ? { ...candidate, name: 'Carteira igual' } : candidate);
    render(<Subject candidates={candidates} />);
    for (const scenarioId of ['A', 'B']) {
      const label = `Carteira igual (ID: ${scenarioId})`;
      expect(screen.getByRole('button', { name: `Analisar composição ${label}` })).toHaveTextContent(`ID: ${scenarioId}`);
      expect(screen.getByRole('link', { name: `Abrir composição ${label}` })).toHaveAttribute('href', `/composicao/${scenarioId}`);
    }
    await userEvent.setup().click(screen.getByRole('button', { name: 'Analisar composição Carteira igual (ID: B)' }));
    const table = screen.getByRole('table', { name: /Efeito de adicionar ou remover empresas/ });
    expect(within(table).getByRole('row', { name: /Remover Homônima ID: B/ })).toHaveTextContent('Carteira vazia não avaliada.');
    expect(within(table).getByRole('row', { name: /Adicionar Homônima ID: A/ })).toHaveTextContent(/Δ: \+R\$\s80,00/);
  });

  it('requests a current selection when none exists and renders names as text', () => {
    const candidates = fixture();
    candidates[0] = { ...candidates[0]!, name: '<img src=x onerror=alert(1)>' };
    const { rerender } = render(<Subject candidates={candidates} />);
    expect(screen.getByRole('heading', { name: /<img src=x/ })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<MemoryRouter><PortfolioMarginalPanel allComparable={candidates} selectedScenarioId={null}
      universeCompanyIds={['A']} onSelect={() => undefined} scenarioHref={id => `/composicao/${id}`} /></MemoryRouter>);
    expect(screen.getByText(/Selecione uma composição atual comparável/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
