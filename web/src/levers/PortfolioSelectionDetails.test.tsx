// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { PortfolioSelectionDetails } from './PortfolioSelectionDetails';
import type { PortfolioMetrics } from './portfolioAnalysis';

const selected: PortfolioMetrics = {
  scenarioId: 'AB', name: 'A + B', companyIds: ['A', 'B'], companyNames: ['A', 'B'],
  savings: '10', volume: '400', baseline: '30', netted: '20', weightedWait: '150',
  waitP95Days: 2, matchedVolume: '0', netability: '0',
  costDelta: { iof: '15', carry: '-3', spread: '2', espera: '-5', fixo: '1' },
};

it('shows period costs, P95 and signed components whose sum equals savings', () => {
  render(<PortfolioSelectionDetails selected={selected} />);
  const details = screen.getByRole('region', { name: 'Detalhes da composição: A + B' });
  expect(within(details).getByText('Custo sem pool').nextElementSibling).toHaveTextContent('30,00');
  expect(within(details).getByText('Custo com pool').nextElementSibling).toHaveTextContent('20,00');
  expect(within(details).getByText('Espera P95 por volume').nextElementSibling).toHaveTextContent('2 dias');
  const carry = within(details).getByRole('rowheader', { name: 'Carry' }).closest('tr')!;
  expect(carry).toHaveTextContent('R$ -3,00');
  expect(within(details).getByRole('rowheader', { name: 'Soma dos componentes' }).closest('tr')).toHaveTextContent('+R$ 10,00');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('preserves costs and explains an exact precision residual without treating it as an error', () => {
  render(<PortfolioSelectionDetails selected={{ ...selected, savings: '10.0000000000000000000000000001' }} />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const note = screen.getByRole('note');
  expect(note).toHaveTextContent(/resíduos de precisão/);
  expect(note).toHaveTextContent('0.0000000000000000000000000001 BRL');
  expect(note).toHaveTextContent(/totais e a economia publicados permanecem a referência/);
  expect(screen.getAllByRole('rowheader')).toHaveLength(6);
  expect(screen.getByRole('rowheader', { name: 'Soma dos componentes' }).closest('tr')).toHaveTextContent('+R$ 10,00');
});

it('retains negative savings without describing the total as a benefit', () => {
  render(<PortfolioSelectionDetails selected={{ ...selected, savings: '-4',
    costDelta: { iof: '0', carry: '-4', spread: '0', espera: '0', fixo: '0' } }} />);
  expect(screen.getByText('Economia total').nextElementSibling).toHaveTextContent('R$ -4,00');
  expect(screen.getByRole('rowheader', { name: 'Soma dos componentes' }).closest('tr')).toHaveTextContent('R$ -4,00');
});
