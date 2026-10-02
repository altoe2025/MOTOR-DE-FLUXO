// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { PortfolioTable as ControlledPortfolioTable } from './PortfolioTable';
import type { PortfolioMetrics } from './portfolioAnalysis';

function PortfolioTable(props: Omit<ComponentProps<typeof ControlledPortfolioTable>, 'showIneligible' | 'onShowIneligibleChange'>) {
  const [showIneligible, setShowIneligible] = useState(true);
  return <ControlledPortfolioTable {...props} showIneligible={showIneligible} onShowIneligibleChange={setShowIneligible} />;
}

function row(index: number): PortfolioMetrics {
  const id = `portfolio-${String(index).padStart(3, '0')}`;
  return { scenarioId: id, name: id, companyIds: [id], companyNames: [id], savings: String(index),
    volume: '100', baseline: '200', netted: '100', weightedWait: '50', waitP95Days: 1,
    matchedVolume: '50', netability: '0.5', costDelta: { iof: '0', carry: '0', spread: '0', espera: '0', fixo: '0' } };
}

it('pages all 255 results at 25, 50 and 100 without dropping the last row', async () => {
  const rows = Array.from({ length: 255 }, (_, index) => {
    const subset = Array.from({ length: 8 }, (_, bit) => `company-${bit}`).filter((_, bit) => ((index + 1) & (1 << bit)) !== 0);
    return { ...row(index), companyIds: subset, companyNames: subset };
  });
  render(<MemoryRouter><PortfolioTable candidates={rows} ineligible={[]} selectedScenarioId={null}
    onSelect={vi.fn()} linkFor={(id) => `/scenario/${id}`} /></MemoryRouter>);
  const user = userEvent.setup();
  const table = screen.getByRole('table', { name: /Todas as composições/ });
  expect(within(table).getAllByRole('row')).toHaveLength(26);
  await user.selectOptions(screen.getByRole('combobox', { name: /Linhas por página/ }), '50');
  expect(within(table).getAllByRole('row')).toHaveLength(51);
  await user.selectOptions(screen.getByRole('combobox', { name: /Linhas por página/ }), '100');
  await user.click(screen.getByRole('button', { name: 'Última página' }));
  expect(within(table).getAllByRole('row')).toHaveLength(56);
  expect(within(table).getByRole('link', { name: 'portfolio-000' })).toBeInTheDocument();
});

it('returns to the first page when filters change', async () => {
  const rows = Array.from({ length: 55 }, (_, index) => row(index));
  const select = vi.fn();
  const view = (resetKey: string) => <MemoryRouter><PortfolioTable candidates={rows} ineligible={[]}
    selectedScenarioId={null} onSelect={select} linkFor={id => `/scenario/${id}`} resetKey={resetKey} /></MemoryRouter>;
  const { rerender } = render(view('none'));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Última página' }));
  expect(screen.getByText('Página 3 de 3; 55 composições.')).toBeInTheDocument();
  rerender(view('volume>100'));
  expect(screen.getByText('Página 1 de 3; 55 composições.')).toBeInTheDocument();
});

it('shows readable reasons for candidates outside the current filters', () => {
  const candidate = row(1);
  render(<MemoryRouter><PortfolioTable candidates={[candidate]}
    ineligible={[{ candidate, reasons: ['maxWaitDays', 'requiredCompanyIds'] }]}
    selectedScenarioId={null} onSelect={vi.fn()} linkFor={id => `/scenario/${id}`} /></MemoryRouter>);
  expect(screen.getByText(/Espera média acima do limite/)).toBeInTheDocument();
  expect(screen.getByText(/Empresa obrigatória ausente/)).toBeInTheDocument();
});

it('clears and announces a selection when its filtered row is hidden', async () => {
  const candidate = row(1);
  const select = vi.fn();
  render(<MemoryRouter><PortfolioTable candidates={[candidate]}
    ineligible={[{ candidate, reasons: ['minVolume'] }]}
    selectedScenarioId={candidate.scenarioId} onSelect={select} linkFor={id => `/scenario/${id}`} /></MemoryRouter>);
  await userEvent.setup().click(screen.getByRole('checkbox', { name: /Mostrar também as composições fora dos filtros/ }));
  expect(select).toHaveBeenCalledWith(null);
  expect(screen.getByRole('status')).toHaveTextContent(/seleção.*removida/i);
});

it('marks legacy name-based identity instead of presenting it as a registered company ID', () => {
  const candidate = { ...row(1), companyIdentitySource: 'LEGACY' as const };
  render(<MemoryRouter><PortfolioTable candidates={[candidate]} ineligible={[]}
    selectedScenarioId={null} onSelect={vi.fn()} linkFor={id => `/scenario/${id}`} /></MemoryRouter>);
  expect(screen.getByText(/Identificação legada por nome/)).toBeInTheDocument();
});

it('clears the removed-selection notice after selecting another visible row', async () => {
  const hidden = row(1);
  const visible = row(2);
  const select = vi.fn();
  render(<MemoryRouter><PortfolioTable candidates={[hidden, visible]}
    ineligible={[{ candidate: hidden, reasons: ['minVolume'] }]}
    selectedScenarioId={hidden.scenarioId} onSelect={select} linkFor={id => `/scenario/${id}`} /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('checkbox', { name: /Mostrar também as composições fora dos filtros/ }));
  expect(screen.getByRole('status')).toHaveTextContent(/seleção.*removida/i);
  await user.click(screen.getByRole('button', { name: 'Selecionar portfolio-002' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
