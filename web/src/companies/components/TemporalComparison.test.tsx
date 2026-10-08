// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ObservedCase } from '../../cases/domain';
import { calculateOperationalProfile } from '../../profiles/calculateOperationalProfile';
import { makeObservedCase } from '../../study/fixtures';
import { TemporalComparison } from './TemporalComparison';

function aCase(id: string, startDate: string, valueBrl: string): ObservedCase {
  const base = makeObservedCase();
  return {
    ...base, id, revision: 1,
    window: { startDate, endDate: startDate, closingDate: startDate },
    orders: [{ ...base.orders[0]!, id: `${id}-order`, knownDate: startDate, deadlineDate: startDate, valueBrl }],
    controlTotals: [{ ...base.controlTotals[0]!, valueBrl }],
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

  // Production break caught: a non-contiguous profile hides its gaps or displays them only after metric values.
  it('shows profile gaps in coverage and before each value', async () => {
    const user = userEvent.setup();
    const first = aCase('case-first', '2026-01-01', '100');
    const last = aCase('case-last', '2026-01-05', '150');
    const profile = await calculateOperationalProfile({
      id: 'profile-gap', ownerSub: first.ownerSub, companyId: first.companyId, version: 1,
      createdAt: '2026-02-01T12:00:00Z', cases: [first, last],
      confirmedDistinctSourceSha256: [first.sourceManifest.files[0]!.sha256],
    });
    render(<TemporalComparison cases={[first]} profiles={[profile]} />);
    await user.click(screen.getByRole('checkbox', { name: /case-first.*revisão 1/i }));
    await user.click(screen.getByRole('checkbox', { name: /perfil operacional.*versão 1/i }));

    const timeline = screen.getByRole('list', { name: 'Linha temporal das observações' });
    expect(within(timeline).getByText(/3 dia\(s\) de lacuna/)).toBeVisible();
    const table = screen.getByRole('table', { name: 'Valores da comparação temporal' });
    const profileCells = within(table).getAllByRole('cell').filter((cell) => cell.textContent?.includes('3 dia(s) de lacuna'));
    expect(profileCells).toHaveLength(4);
    for (const cell of profileCells) {
      expect(cell.textContent?.indexOf('3 dia(s) de lacuna')).toBeLessThan(cell.textContent?.indexOf('Valor:') ?? Number.MAX_SAFE_INTEGER);
    }
  });
});
