// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PROFILE_MVP_EXAMPLE_ID } from '../../study/domain';
import { makeScenarioDraft, makeSyntheticSnapshot } from '../../study/fixtures';
import type { ScenarioDocument } from '../../study/model';
import { HypothesisBuilder } from './HypothesisBuilder';
import { PortfolioCompositionSummary } from './PortfolioCompositionSummary';

function scenario(profileMvp = false): ScenarioDocument {
  const draft = makeScenarioDraft({ sourceSnapshot: makeSyntheticSnapshot() });
  if (profileMvp && draft.sourceSnapshot.source.kind === 'SYNTHETIC') {
    draft.sourceSnapshot.source.recipe.exampleId = PROFILE_MVP_EXAMPLE_ID;
  }
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
  it('leva a ação de alterar carteira ao editor de composição para a origem Profile MVP', async () => {
    const base = scenario(true);
    render(<>
      <PortfolioCompositionSummary scenario={base}
        onEdit={() => document.getElementById('composition-editor')?.focus()} />
      <div id="composition-editor" tabIndex={-1} aria-label="Editor de hipóteses">
        <HypothesisBuilder baseScenario={base} availableProfiles={[]} onCreate={vi.fn()} />
      </div>
    </>);
    expect(screen.getByText(/1 participante/i)).toBeVisible();
    expect(screen.getByText('Exportador', { selector: 'strong' })).toBeVisible();
    expect(screen.getByText(/Perfil profile-a/i)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Criar hipótese / alterar carteira' }));
    expect(screen.getByLabelText('Editor de hipóteses')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Criar hipótese de composição' })).toBeVisible();
    expect(screen.getByLabelText('Adicionar Perfil')).toBeVisible();
  });

  it('oferece apenas criar hipótese para origem sintética legada com snapshot de geração', async () => {
    const base = scenario();
    render(<>
      <PortfolioCompositionSummary scenario={base}
        onEdit={() => document.getElementById('composition-editor')?.focus()} />
      <div id="composition-editor" tabIndex={-1} aria-label="Editor de hipóteses">
        <HypothesisBuilder baseScenario={base} availableProfiles={[]} onCreate={vi.fn()} />
      </div>
    </>);
    expect(screen.queryByRole('button', { name: /alterar carteira/i })).not.toBeInTheDocument();
    const createButtons = screen.getAllByRole('button', { name: 'Criar hipótese' });
    expect(createButtons).toHaveLength(2);
    await userEvent.setup().click(createButtons[0]!);
    expect(screen.getByLabelText('Editor de hipóteses')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Criar hipótese' })).toBeVisible();
    expect(screen.queryByLabelText('Adicionar Perfil')).not.toBeInTheDocument();
  });

  it('não promete alterar carteira quando a origem não tem composição gerável', () => {
    render(<PortfolioCompositionSummary scenario={makeScenarioDraft() as ScenarioDocument} onEdit={vi.fn()} />);
    expect(screen.getByText(/não possui participantes geráveis/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Criar hipótese' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /alterar carteira/i })).not.toBeInTheDocument();
  });
});
