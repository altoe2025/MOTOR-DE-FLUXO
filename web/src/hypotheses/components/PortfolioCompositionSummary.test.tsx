// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeScenarioDraft, makeSyntheticSnapshot } from '../../study/fixtures';
import type { ScenarioDocument } from '../../study/model';
import { PortfolioCompositionSummary } from './PortfolioCompositionSummary';

function scenario(): ScenarioDocument {
  const draft = makeScenarioDraft({ sourceSnapshot: makeSyntheticSnapshot() });
  draft.sourceSnapshot.generationInputSnapshot = {
    participants: [{ id: 'participant-a', profile: 'exportador', seed: '7', monthly_volume_brl: '100',
      ticket_median_brl: '10', out_fraction: '0.5', deadline: { mode: 'FIXED', days: 7 },
      eh_efx: false, purpose_out: 'SERVICES', purpose_in: 'SERVICES' }],
    warmup_days: 0, measurement_days: 30, window_days: 7, costs: draft.premises.costs,
    sources: { '/participants/participant-a/profile': {
      kind: 'ESTIMATIVA_USUARIO', source: `profile-mvp:profile-a@${'a'.repeat(64)}:derived`,
      recorded_at: '2026-09-23T00:00:00Z',
    } },
  };
  return draft as ScenarioDocument;
}

describe('resumo da composição', () => {
  it('mostra composição persistida junto da ação de edição', async () => {
    const onEdit = vi.fn();
    render(<PortfolioCompositionSummary scenario={scenario()} onEdit={onEdit} />);
    expect(screen.getByText(/1 participante/i)).toBeVisible();
    expect(screen.getByText(/Exportador/i)).toBeVisible();
    expect(screen.getByText(/Perfil profile-a/i)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Criar hipótese / alterar carteira' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('não promete alterar carteira quando a origem não tem composição gerável', () => {
    render(<PortfolioCompositionSummary scenario={makeScenarioDraft() as ScenarioDocument} onEdit={vi.fn()} />);
    expect(screen.getByText(/não possui participantes geráveis/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Criar hipótese' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /alterar carteira/i })).not.toBeInTheDocument();
  });
});
