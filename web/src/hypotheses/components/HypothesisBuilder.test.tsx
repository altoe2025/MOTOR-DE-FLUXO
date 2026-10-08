// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PROFILE_MVP_EXAMPLE_ID } from '../../study/domain';
import { makeObservedSnapshot, makeScenarioDraft, makeSyntheticSnapshot } from '../../study/fixtures';
import type { ScenarioDocument } from '../../study/model';
import { HypothesisBuilder } from './HypothesisBuilder';

function scenario(kind: 'OBSERVED' | 'PROFILE'): ScenarioDocument {
  const draft = makeScenarioDraft({
    sourceSnapshot: kind === 'OBSERVED' ? makeObservedSnapshot() : makeSyntheticSnapshot(),
  });
  if (kind === 'PROFILE' && draft.sourceSnapshot.source.kind === 'SYNTHETIC') {
    draft.sourceSnapshot.source.recipe.exampleId = PROFILE_MVP_EXAMPLE_ID;
    draft.sourceSnapshot.generationInputSnapshot = {
      participants: [{
        id: '00000000-0000-4000-8000-000000000099', profile: 'tesouraria_corporativa', seed: '1',
        monthly_volume_brl: '3000', ticket_median_brl: '125', out_fraction: '0.6',
        deadline: { mode: 'FIXED', days: 7 }, eh_efx: false,
        purpose_out: 'ANEXO_V_REMESSA_TERCEIRO', purpose_in: 'ANEXO_V_DISPONIBILIDADE',
      }],
      warmup_days: 0, measurement_days: 365, window_days: 7,
      costs: structuredClone(draft.premises.costs),
      sources: {
        '/participants/00000000-0000-4000-8000-000000000099/profile': {
          kind: 'ESTIMATIVA_USUARIO', source: `profile-mvp:profile-a@${'a'.repeat(64)}:derived`,
          recorded_at: '2026-09-20T12:00:00Z',
        },
      },
    };
  }
  return { ...draft, inputFingerprint: 'f'.repeat(64) } as ScenarioDocument;
}

describe('HypothesisBuilder', () => {
  it('mostra apenas janela e sete custos escalares para base observada', () => {
    render(<HypothesisBuilder baseScenario={scenario('OBSERVED')} onCreate={vi.fn()} />);
    expect(screen.getByLabelText('Janela em dias')).toBeVisible();
    expect(screen.queryByLabelText('Multiplicador de volume')).not.toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(8);
  });

  it('mostra geração, premissas e valores congelados para simulação por Perfil', () => {
    render(<HypothesisBuilder baseScenario={scenario('PROFILE')} onCreate={vi.fn()} />);
    for (const label of [
      'Multiplicador de volume', 'Deslocamento da fração OUT', 'Multiplicador de ticket',
      'Prazo', 'Janela em dias', 'Spread do rail em bps',
    ]) expect(screen.getByLabelText(label)).toBeVisible();
    for (const text of [
      'ID do Perfil: profile-a', `Fingerprint do Perfil: ${'a'.repeat(64)}`,
      'Participante: 00000000-0000-4000-8000-000000000099',
      'Perfil do gerador: tesouraria_corporativa', 'Seed: 1', 'eFX: Não',
      'Finalidade OUT: ANEXO_V_REMESSA_TERCEIRO', 'Finalidade IN: ANEXO_V_DISPONIBILIDADE',
      'Horizonte: 365 dias', 'Versão da preparação: 1.0.0',
      'Versão do gerador: dimensionamento-v1', `Versão do motor: ${'d'.repeat(40)}`,
    ]) expect(screen.getByText(text, { exact: true })).toBeVisible();
  });

  it('antecipa quando regenera ou reutiliza as ordens', async () => {
    const user = userEvent.setup();
    render(<HypothesisBuilder baseScenario={scenario('PROFILE')} onCreate={vi.fn()} />);
    expect(screen.getByText('As mesmas ordens serão reutilizadas')).toBeVisible();
    await user.clear(screen.getByLabelText('Multiplicador de volume'));
    await user.type(screen.getByLabelText('Multiplicador de volume'), '1.2');
    expect(screen.getByText('As ordens serão regeneradas')).toBeVisible();
    expect(screen.getByRole('table', { name: 'Alterações da hipótese' })).toHaveTextContent('1.2');
  });

  it('encaminha a simulação por Perfil para o construtor de composição', () => {
    render(<HypothesisBuilder baseScenario={scenario('PROFILE')} availableProfiles={[]} onCreate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Criar hipótese de composição' })).toBeVisible();
    expect(screen.getByLabelText('Adicionar Perfil')).toBeVisible();
    expect(screen.queryByLabelText('Multiplicador de volume')).not.toBeInTheDocument();
  });
});
