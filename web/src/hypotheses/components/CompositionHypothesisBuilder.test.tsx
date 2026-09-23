// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OperationalProfileVersion } from '../../profiles/domain';
import { makeScenarioDraft, makeSyntheticSnapshot } from '../../study/fixtures';
import type { ScenarioDocument } from '../../study/model';
import { CompositionHypothesisBuilder } from './CompositionHypothesisBuilder';

function profile(id: string, companyId: string): OperationalProfileVersion {
  return {
    schemaVersion: '1.0.0', id, revision: 1, ownerSub: 'owner-1', companyId,
    periodStart: '2026-01-01', periodEnd: '2026-01-31', status: 'ACTIVE',
    coverage: { coveredDays: 31, expectedDays: 31, ratio: '1' },
    compatibility: { compatible: true, blockers: [] },
    metrics: {
      volume: { totalBrl: { state: 'AVAILABLE', value: '3100000' } },
      ticketsBrl: { p50: { state: 'AVAILABLE', value: '100000' } },
      direction: { state: 'AVAILABLE', value: { out: { fraction: '0.6' }, in: { fraction: '0.4' } } },
    },
    provenance: [], createdAt: '2026-09-21T10:00:00Z',
    documentFingerprint: id === 'profile-a' ? 'a'.repeat(64) : 'c'.repeat(64),
  } as unknown as OperationalProfileVersion;
}

function base(): ScenarioDocument {
  const draft = makeScenarioDraft({ sourceSnapshot: makeSyntheticSnapshot() });
  if (draft.sourceSnapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture inválida');
  draft.sourceSnapshot.source.recipe.exampleId = 'profile-mvp-v1';
  draft.sourceSnapshot.generationInputSnapshot = {
    participants: [{
      id: '00000000-0000-4000-8000-000000000101', profile: 'tesouraria_corporativa', seed: '1',
      monthly_volume_brl: '3000000', ticket_median_brl: '100000', out_fraction: '0.6',
      deadline: { mode: 'FIXED', days: 7 }, eh_efx: false,
      purpose_out: 'SERVICES', purpose_in: 'SERVICES',
    }],
    warmup_days: 0, measurement_days: 365, window_days: 7,
    costs: structuredClone(draft.premises.costs),
    sources: {
      '/participants/00000000-0000-4000-8000-000000000101/profile': {
        kind: 'ESTIMATIVA_USUARIO', source: `profile-mvp:profile-a@${'a'.repeat(64)}:derived`,
        recorded_at: '2026-09-21T10:00:00Z',
      },
    },
  };
  return { ...draft, inputFingerprint: 'f'.repeat(64) } as ScenarioDocument;
}

describe('CompositionHypothesisBuilder', () => {
  it('edita um participante e adiciona outro Perfil sem perder identidade', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<CompositionHypothesisBuilder baseScenario={base()}
      availableProfiles={[profile('profile-a', 'empresa-a'), profile('profile-c', 'empresa-c')]}
      onCreate={onCreate} />);

    await user.clear(screen.getByLabelText(/volume mensal — empresa-a/i));
    await user.type(screen.getByLabelText(/volume mensal — empresa-a/i), '2500000');
    await user.selectOptions(screen.getByLabelText(/adicionar perfil/i), 'profile-c');
    expect(screen.getByText(/as ordens serão regeneradas/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /criar hipótese/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'PROFILE_COMPOSITION',
      participantChanges: expect.arrayContaining([
        expect.objectContaining({ kind: 'UPDATE_PARTICIPANT' }),
        expect.objectContaining({ kind: 'ADD_PROFILE' }),
      ]),
    }));
  });

  it('bloqueia nome vazio, nenhuma mudança e remoção do último participante', async () => {
    const user = userEvent.setup();
    render(<CompositionHypothesisBuilder baseScenario={base()}
      availableProfiles={[profile('profile-a', 'empresa-a')]}
      onCreate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /criar hipótese/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /remover empresa-a/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/ao menos um participante/i);
  });

  it('preserva o rascunho e oferece retry quando a criação falha', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('conflito de revisão'));
    render(<CompositionHypothesisBuilder baseScenario={base()}
      availableProfiles={[profile('profile-a', 'empresa-a')]}
      onCreate={onCreate} />);
    const volume = screen.getByLabelText(/volume mensal — empresa-a/i);
    await user.clear(volume); await user.type(volume, '2500000');
    await user.click(screen.getByRole('button', { name: /criar hipótese/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/conflito/i);
    expect(volume).toHaveValue(2500000);
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeVisible();
  });

  it('reutiliza as ordens quando somente uma premissa comum muda', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<CompositionHypothesisBuilder baseScenario={base()}
      availableProfiles={[profile('profile-a', 'empresa-a')]}
      onCreate={onCreate} />);
    const window = screen.getByLabelText('Janela em dias');
    await user.clear(window); await user.type(window, '10');
    expect(screen.getByText(/as mesmas ordens serão reutilizadas/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /criar hipótese/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      windowDays: 10, participantChanges: [],
    }));
  });

  it('explica as entidades e mantém o Perfil intacto ao remover um participante da hipótese', async () => {
    const user = userEvent.setup();
    const original = profile('profile-a', 'empresa-a');
    const originalBytes = JSON.stringify(original);
    const other = profile('profile-c', 'empresa-c');
    const onCreate = vi.fn();
    render(<CompositionHypothesisBuilder baseScenario={base()}
      availableProfiles={[original, other]} onCreate={onCreate} />);
    expect(screen.getByText(/Perfil Operacional é uma versão imutável/i)).toBeVisible();
    expect(screen.getByText(/Participante é a presença de uma empresa/i)).toBeVisible();
    expect(screen.getByText(/Arquétipo gerador é um padrão sintético/i)).toBeVisible();
    await user.selectOptions(screen.getByLabelText(/adicionar perfil/i), 'profile-c');
    await user.click(screen.getByRole('button', { name: /remover empresa-a/i }));
    await user.click(screen.getByRole('button', { name: /criar hipótese/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      participantChanges: expect.arrayContaining([expect.objectContaining({ kind: 'REMOVE_PARTICIPANT' })]),
    }));
    expect(JSON.stringify(original)).toBe(originalBytes);
  });
});
