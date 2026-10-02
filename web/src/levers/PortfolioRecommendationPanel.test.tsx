// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { addPortfolioFixture, measuredStudyFixture } from './testFixtures';
import { PortfolioRecommendation } from './PortfolioRecommendationPanel';

async function subject() {
  const { study, base } = await measuredStudyFixture();
  addPortfolioFixture(study, base, 'A', ['A-out'], '5');
  addPortfolioFixture(study, base, 'B', ['B-in'], '3');
  const before = structuredClone(study);
  render(<MemoryRouter><PortfolioRecommendation study={study} /></MemoryRouter>);
  return { study, before };
}

describe('PortfolioRecommendation', () => {
  it('defers projection across 255 candidate updates and projects once when the batch ends', async () => {
    const { study, base } = await measuredStudyFixture();
    for (let index = 1; index < 255; index += 1) {
      const scenario = structuredClone(study.scenarios[0]!);
      scenario.id = `composition-${index}`;
      scenario.name = `Composition ${index}`;
      study.scenarios.push(scenario);
      const execution = structuredClone(base);
      execution.id = `execution-${index}`;
      execution.scenarioId = scenario.id;
      study.executions.push(execution);
    }
    let reads = 0;
    study.executions = new Proxy(study.executions, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const view = (revision: number, deferred: boolean) => <MemoryRouter>
      <PortfolioRecommendation study={{ ...study, revision }} deferred={deferred} />
    </MemoryRouter>;
    const { rerender } = render(view(0, true));
    for (let progress = 1; progress <= 255; progress += 1) rerender(view(progress, true));
    expect(reads).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent(/após o lote/);
    rerender(view(256, false));
    expect(screen.getByText('Comparáveis atuais').parentElement).toHaveTextContent('255');
    expect(screen.getByRole('heading', { name: /Composição recomendada:/ })).toBeInTheDocument();
    expect(reads).toBeLessThan(1020);
  });
  it('restores the objective, filters and selected analysis after a deferred batch', async () => {
    const { study, base } = await measuredStudyFixture();
    addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    addPortfolioFixture(study, base, 'B', ['B-in'], '3');
    const view = (deferred: boolean) => <MemoryRouter><PortfolioRecommendation study={study} deferred={deferred} /></MemoryRouter>;
    const { rerender } = render(view(false));
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'efficiency');
    await user.type(screen.getByRole('textbox', { name: /Economia mínima/ }), '4');
    await user.click(within(screen.getByRole('region', { name: 'Alternativas em destaque' })).getByRole('button', { name: 'A' }));

    rerender(view(true));
    expect(screen.queryByRole('combobox', { name: 'Objetivo' })).not.toBeInTheDocument();
    rerender(view(false));
    expect(screen.getByRole('combobox', { name: 'Objetivo' })).toHaveValue('efficiency');
    expect(screen.getByRole('textbox', { name: /Economia mínima/ })).toHaveValue('4');
    expect(screen.getByText(/Composição selecionada: A/)).toBeInTheDocument();
  });
  it.each([['costReduction', 'Redução do custo', '50,00%'], ['netability', 'Netabilidade', '0,00%']])(
    'exposes the absolute value of %s even with a single comparable portfolio', async (objective, label, value) => {
      const { study } = await measuredStudyFixture();
      render(<MemoryRouter><PortfolioRecommendation study={study} /></MemoryRouter>);
      await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), objective);
      const metric = screen.getByText(label).closest('div');
      expect(metric).toHaveTextContent(value);
    });

  it('returns to the current recommendation after selecting an alternative and changing objective', async () => {
    await subject();
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('region', { name: 'Alternativas em destaque' })).getByRole('button', { name: 'A' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'costReduction');
    await user.click(screen.getByRole('button', { name: 'Analisar recomendação atual' }));
    expect(screen.queryByText(/Composição selecionada:/)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Detalhes da composição: Caso observado' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contribuição marginal: Caso observado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Objetivo' })).toHaveValue('costReduction');
  });
  it('keeps the recommendation and analysis without the chart or the full compositions table', async () => {
    await subject();
    expect(screen.getByRole('heading', { name: /Composição recomendada:/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Economia e espera das carteiras' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Dados do gráfico/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Todas as composições/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Detalhes da composição:/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Contribuição marginal:/ })).toBeInTheDocument();
  });

  it('switches the winner to efficiency without changing the study', async () => {
    const { study, before } = await subject();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'efficiency');
    expect(screen.getByRole('heading', { name: 'Composição recomendada: A' })).toBeInTheDocument();
    expect(study).toEqual(before);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'wait');
    expect(screen.getByRole('heading', { name: 'Composição recomendada: B' })).toBeInTheDocument();
  });

  it('shows a field error, then clears independent filters', async () => {
    await subject();
    const user = userEvent.setup();
    const wait = screen.getByRole('textbox', { name: /Espera média máxima/ });
    await user.type(wait, '-1');
    expect(wait).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/número não negativo válido/);
    expect(screen.queryByRole('heading', { name: /Composição recomendada:/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Corrija os campos indicados/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(wait).toHaveValue('');
    expect(screen.getByRole('heading', { name: /Composição recomendada:/ })).toBeInTheDocument();
  });

  it('explains when no portfolio satisfies an absolute filter', async () => {
    await subject();
    await userEvent.setup().type(screen.getByRole('textbox', { name: /Economia mínima/ }), '999');
    expect(screen.getByText(/Nenhuma carteira atende/)).toBeInTheDocument();
  });

  it('keeps the recommendation independent of an alternative selected for analysis', async () => {
    await subject();
    const user = userEvent.setup();
    const winner = screen.getByRole('heading', { name: /Composição recomendada:/ }).textContent;
    await user.click(within(screen.getByRole('region', { name: 'Alternativas em destaque' }))
      .getByRole('button', { name: 'A' }));
    expect(screen.getByRole('heading', { name: /Composição recomendada:/ })).toHaveTextContent(winner ?? '');
    expect(screen.getByText(/Composição selecionada: A/)).toBeInTheDocument();
  });

  it('explains signed money, efficiency, cost, wait and company differences against the named alternative', async () => {
    await subject();
    const explanation = screen.getByText(/Frente à alternativa A/);
    expect(explanation).toHaveTextContent('+R$');
    expect(explanation).toHaveTextContent('bps');
    expect(explanation).toHaveTextContent('p.p.');
    expect(explanation).toHaveTextContent('dias');
    expect(explanation).toHaveTextContent('empresas');
  });

  it('treats a cleared relative percentage as absent in reference, shortcut and warning', async () => {
    await subject();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'wait');
    await user.click(screen.getByRole('button', { name: 'Preservar 95% da melhor economia' }));
    expect(screen.getByText(/Melhor economia após restrições absolutas/)).toBeInTheDocument();
    const percent = screen.getByRole('textbox', { name: /Preservar percentual/ });
    await user.clear(percent);
    expect(screen.queryByText(/Melhor economia após restrições absolutas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preservar 95% da melhor economia' })).toBeInTheDocument();
    expect(screen.getByText(/Sem meta de economia/)).toBeInTheDocument();
  });

  it('resets objective, filters and selected scenario when the study ID changes', async () => {
    const { study: first, base } = await measuredStudyFixture();
    addPortfolioFixture(first, base, 'A', ['A-out'], '5');
    const { study: second } = await measuredStudyFixture();
    second.id = 'another-study';
    const view = (study: typeof first) => <MemoryRouter><PortfolioRecommendation study={study} /></MemoryRouter>;
    const { rerender } = render(view(first));
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'wait');
    await user.click(screen.getByRole('checkbox', { name: 'A' }));
    await user.click(within(screen.getByRole('region', { name: 'Alternativas em destaque' }))
      .getByRole('button', { name: 'A' }));
    rerender(view(second));
    expect(screen.getByRole('combobox', { name: 'Objetivo' })).toHaveValue('savings');
    expect(screen.queryByText(/Composição selecionada:/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Composição recomendada:/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'A' })).not.toBeChecked();
  });

  it('uses the current recommendation for details until an alternative or marginal counterpart is selected', async () => {
    await subject();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'efficiency');
    expect(screen.getByRole('heading', { name: 'Contribuição marginal: A' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('region', { name: 'Alternativas em destaque' }))
      .getByRole('button', { name: 'B' }));
    expect(screen.getByRole('region', { name: 'Detalhes da composição: B' })).toBeInTheDocument();
    const marginal = screen.getByRole('region', { name: 'Contribuição marginal: B' });
    await user.click(within(marginal).getByRole('button', { name: /^Analisar composição/ }));
    expect(screen.getByRole('region', { name: /Detalhes da composição:/ })).not.toHaveAccessibleName('Detalhes da composição: B');
    expect(screen.getByRole('heading', { name: 'Composição recomendada: A' })).toBeInTheDocument();
  });

  it('retains marginal counterparts outside filters without the chart or full table', async () => {
    await subject();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: /Economia mínima/ }), '6');
    const marginal = screen.getByRole('region', { name: /Contribuição marginal:/ });
    expect(within(marginal).getAllByText(/Contraparte fora dos filtros/)).toHaveLength(2);
    await user.click(within(marginal).getByRole('button', { name: 'Analisar composição A' }));
    expect(screen.getByRole('region', { name: 'Detalhes da composição: A' })).toBeInTheDocument();
  });

  it('labels an independent highlight excluded by the active objective and reveals it when selected', async () => {
    const { study, base } = await measuredStudyFixture();
    addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    const zeroBaseline = addPortfolioFixture(study, base, 'B', ['B-in'], '0');
    const aggregate = zeroBaseline.envelope!.selected_execution.result.agregado;
    aggregate.baseline_periodo = { iof: '0', carry: '0', spread: '0', espera: '0', fixo: '0', total: '0' };
    aggregate.netado_periodo = { ...aggregate.baseline_periodo };
    render(<MemoryRouter><PortfolioRecommendation study={study} /></MemoryRouter>);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Objetivo' }), 'costReduction');
    const highlights = screen.getByRole('region', { name: 'Alternativas em destaque' });
    const highlighted = within(highlights).getByRole('button', { name: 'B' });
    expect(highlighted.closest('li')).toHaveTextContent(/Fora do objetivo ou dos filtros ativos/);
    expect(highlighted.closest('li')).toHaveTextContent(/custo sem pool zero.*redução percentual indisponível/i);
    await user.click(highlighted);
    expect(highlighted).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Detalhes da composição: B' })).toBeInTheDocument();
  });

  it('distinguishes same-named highlights by scenario ID and selects the requested one', async () => {
    const { study, base } = await measuredStudyFixture();
    addPortfolioFixture(study, base, 'A', ['A-out'], '5');
    addPortfolioFixture(study, base, 'B', ['B-in'], '3');
    study.scenarios.filter(scenario => scenario.id === 'A' || scenario.id === 'B')
      .forEach(scenario => { scenario.name = 'Mesmo nome'; });
    render(<MemoryRouter><PortfolioRecommendation study={study} /></MemoryRouter>);
    const highlights = screen.getByRole('region', { name: 'Alternativas em destaque' });
    expect(within(highlights).getByRole('button', { name: 'Mesmo nome (ID: A)' })).toHaveTextContent('ID: A');
    await userEvent.setup().click(within(highlights).getByRole('button', { name: 'Mesmo nome (ID: B)' }));
    expect(screen.getByRole('link', { name: 'Abrir composição selecionada' })).toHaveAttribute('href', expect.stringContaining('scenarioId=B'));
    expect(within(highlights).getByRole('button', { name: 'Mesmo nome (ID: B)' })).toHaveAttribute('aria-pressed', 'true');
  });
});
