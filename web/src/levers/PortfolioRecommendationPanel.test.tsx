// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import { PortfolioRecommendation } from './PortfolioRecommendationPanel';
import { recommendPortfolios, type PortfolioCandidate } from './portfolioRecommendation';

vi.mock('./portfolioRecommendation', () => ({ recommendPortfolios: vi.fn() }));

const portfolios: PortfolioCandidate[] = [
  { scenarioId: 'more-savings', name: 'Carteira ampla', companies: ['Empresa A', 'Empresa B'], savings: '200', volume: '2000', waitDays: 3, eligible: true },
  { scenarioId: 'less-wait', name: 'Carteira rápida', companies: ['Empresa A'], savings: '100', volume: '1000', waitDays: 1.5, eligible: true },
];

async function subject() {
  const { study } = await observedInput();
  render(<MemoryRouter><PortfolioRecommendation study={study} /></MemoryRouter>);
  return study;
}

beforeEach(() => {
  vi.mocked(recommendPortfolios).mockImplementation((_study, maxWaitDays) => {
    const candidates = portfolios.map((candidate) => ({ ...candidate, eligible: maxWaitDays === null || candidate.waitDays <= maxWaitDays }));
    return { candidates, winner: candidates.find((candidate) => candidate.eligible) ?? null,
      excluded: [{ scenarioId: 'pending', name: 'Pendente', reason: 'Sem diagnóstico atual.' }] };
  });
});

describe('PortfolioRecommendation', () => {
  it('explains when even the best evaluated composition loses money against execution without pool', async () => {
    const candidate = { ...portfolios[0]!, savings: '-20' };
    vi.mocked(recommendPortfolios).mockReturnValue({ candidates: [candidate], winner: candidate, excluded: [] });
    await subject();
    expect(screen.getByRole('note')).toHaveTextContent('Mesmo a melhor composição avaliada não reduz o custo em relação à execução sem pool.');
    expect(screen.getByRole('link', { name: 'Abrir composição' })).toBeInTheDocument();
  });
  it('shows the best evaluated composition and opens its existing diagnostic', async () => {
    const study = await subject();
    expect(screen.getByRole('heading', { name: 'Composição recomendada: Carteira ampla' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir composição' })).toHaveAttribute('href', `/estudos/${study.id}/diagnostico?scenarioId=more-savings`);
    expect(screen.getByText(/Não garante a melhor combinação possível/)).toBeInTheDocument();
    expect(screen.getByText(/custos das empresas que ficam fora/)).toBeInTheDocument();
    expect(screen.getByText('Sem diagnóstico atual.')).toBeInTheDocument();
    expect(screen.getByText('1.000,00 bps')).toBeInTheDocument();
    expect(screen.getByText(/próxima alternativa que atende, Carteira rápida/)).toHaveTextContent('diferença de espera média de +1,50 dias');
  });

  it('accepts decimal comma, changes the recommendation, and clears the constraint', async () => {
    await subject();
    const user = userEvent.setup();
    const field = screen.getByRole('textbox', { name: /Limite de espera média/ });
    await user.type(field, '1,5');
    expect(screen.getByRole('heading', { name: 'Composição recomendada: Carteira rápida' })).toBeInTheDocument();
    expect(screen.getByText('Acima do limite de espera')).toBeInTheDocument();
    expect(screen.getByText(/média ponderada pelo volume, não o prazo máximo/)).toBeInTheDocument();
    await user.clear(field);
    expect(screen.getByRole('heading', { name: 'Composição recomendada: Carteira ampla' })).toBeInTheDocument();
  });

  it('reports no eligible portfolio and prevents a recommendation for invalid limits', async () => {
    await subject();
    const user = userEvent.setup();
    const field = screen.getByRole('textbox', { name: /Limite de espera média/ });
    await user.type(field, '0');
    expect(screen.getByText(/Nenhuma carteira avaliada atende/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, '-1');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um número de dias igual ou maior que zero');
    expect(screen.queryByRole('link', { name: 'Abrir composição' })).not.toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });
});
