// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ObservedCase } from '../../cases/domain';
import { makeObservedCase } from '../../study/fixtures';
import { TemporalComparison } from './TemporalComparison';

function aCase(id: string, startDate: string, valueBrl: string): ObservedCase {
  const base = makeObservedCase();
  return {
    ...base, id, revision: 1,
    window: { startDate, endDate: startDate, closingDate: startDate },
    orders: [{ ...base.orders[0]!, id: `${id}-order`, knownDate: startDate, deadlineDate: startDate, valueBrl }],
  };
}

describe('TemporalComparison', () => {
  // Production break caught: values render before coverage or the accessible table diverges from the selected timeline.
  it('selects 2–6 observations and presents coverage before equivalent values and deltas', async () => {
    const user = userEvent.setup();
    const cases = [aCase('case-a', '2026-01-01', '100'), aCase('case-b', '2026-02-01', '150')];
    render(<TemporalComparison cases={cases} profiles={[]} />);

    expect(screen.getByText(/Selecione de 2 a 6/)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /case-a.*revisão 1/i }));
    await user.click(screen.getByRole('checkbox', { name: /case-b.*revisão 1/i }));

    const region = screen.getByRole('region', { name: 'Comparação temporal' });
    const coverage = within(region).getByRole('heading', { name: 'Cobertura e proveniência' });
    const values = within(region).getByRole('heading', { name: 'Valores observados' });
    expect(coverage.compareDocumentPosition(values) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(region).getByText('diferença entre observações selecionadas')).toBeVisible();
    expect(within(region).queryByText(/tendência/i)).not.toBeInTheDocument();
    expect(within(region).getByRole('list', { name: 'Linha temporal das observações' })).toHaveTextContent('case-a');
    expect(within(region).getByRole('table', { name: 'Valores da comparação temporal' })).toHaveTextContent('R$');
  });

  // Production break caught: selection permits more than six items or renders prohibited Stage 4 actions/language.
  it('caps selection at six and never offers scenario-variant semantics', async () => {
    const user = userEvent.setup();
    const cases = Array.from({ length: 7 }, (_, index) => aCase(`case-${index}`, `2026-01-${String(index + 1).padStart(2, '0')}`, String(index + 1)));
    render(<TemporalComparison cases={cases} profiles={[]} />);
    for (const checkbox of screen.getAllByRole('checkbox').slice(0, 6)) await user.click(checkbox);
    expect(screen.getAllByRole('checkbox')[6]).toBeDisabled();
    const text = screen.getByRole('region', { name: 'Comparação temporal' }).textContent?.toLocaleLowerCase('pt-BR') ?? '';
    expect(text).not.toMatch(/cenário-base|hipótese|marginal|criar variante/);
  });
});
