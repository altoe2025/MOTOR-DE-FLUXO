// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStudy } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { summarizeStudy, type StudySummary } from '../storage/applicationRepository';
import { DiagnosticsHubPage } from './DiagnosticsHubPage';

const controller = {
  listStudySummaries: vi.fn<() => Promise<StudySummary[]>>(),
  readStudy: vi.fn<(id: string) => Promise<StudyDocument | null>>(),
  listStudies: vi.fn<() => Promise<StudyDocument[]>>(),
};

vi.mock('../app/providers', () => ({ useStudyController: () => controller }));

async function study(id: string, name: string): Promise<StudyDocument> {
  return createStudy({
    id,
    ownerSub: FIXTURE_OWNER,
    name,
    baseScenario: makeScenarioDraft({ id: `${id}-scenario`, name: `Cenário de ${name}` }),
    now: FIXTURE_NOW,
  });
}

describe('DiagnosticsHubPage', () => {
  beforeEach(async () => {
    const first = await study('study-a', 'Estudo A');
    const second = await study('study-b', 'Estudo B');
    controller.listStudySummaries.mockReset().mockResolvedValue([summarizeStudy(first, 0), summarizeStudy(second, 0)]);
    controller.readStudy.mockReset().mockImplementation(async (id) => id === first.id ? first : id === second.id ? second : null);
    controller.listStudies.mockReset();
  });

  it('só monta os cenários do estudo que o usuário expandiu', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DiagnosticsHubPage /></MemoryRouter>);

    const firstToggle = await screen.findByRole('button', {
      name: 'Mostrar diagnósticos de Estudo A',
    });
    const secondToggle = screen.getByRole('button', {
      name: 'Mostrar diagnósticos de Estudo B',
    });
    expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
    expect(secondToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Cenários de Estudo A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cenários de Estudo B' })).not.toBeInTheDocument();

    await user.click(firstToggle);

    expect(await screen.findByRole('region', { name: 'Cenários de Estudo A' })).toBeInTheDocument();
    expect(screen.getByText('Cenário de Estudo A')).toBeInTheDocument();
    expect(controller.readStudy).toHaveBeenCalledExactlyOnceWith('study-a');
    expect(controller.listStudies).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Cenários de Estudo B' })).not.toBeInTheDocument();
    expect(firstToggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(firstToggle);

    expect(screen.queryByRole('region', { name: 'Cenários de Estudo A' })).not.toBeInTheDocument();
    expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('carrega apenas o estudo expandido e compartilha a leitura após recolher e expandir durante o carregamento', async () => {
    let resolveRead!: (study: StudyDocument) => void;
    controller.readStudy.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const first = await study('study-a', 'Estudo A');
    render(<MemoryRouter><DiagnosticsHubPage /></MemoryRouter>);
    const toggle = await screen.findByRole('button', { name: 'Mostrar diagnósticos de Estudo A' });
    expect(controller.readStudy).not.toHaveBeenCalled();
    await userEvent.click(toggle);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando cenários de Estudo A');
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(controller.readStudy).toHaveBeenCalledExactlyOnceWith('study-a');
    await act(async () => resolveRead(first));
    expect(await screen.findByRole('region', { name: 'Cenários de Estudo A' })).toBeInTheDocument();
  });

  it('mantém a tabela oculta se a leitura terminar depois do recolhimento', async () => {
    let resolveRead!: (study: StudyDocument) => void;
    controller.readStudy.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    render(<MemoryRouter><DiagnosticsHubPage /></MemoryRouter>);
    const toggle = await screen.findByRole('button', { name: 'Mostrar diagnósticos de Estudo A' });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    await act(async () => resolveRead(await study('study-a', 'Estudo A')));
    expect(screen.queryByRole('region', { name: 'Cenários de Estudo A' })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('mostra erro por estudo e permite tentar de novo', async () => {
    controller.readStudy.mockRejectedValueOnce(new Error('Leitura indisponível'));
    render(<MemoryRouter><DiagnosticsHubPage /></MemoryRouter>);
    const toggle = await screen.findByRole('button', { name: 'Mostrar diagnósticos de Estudo A' });
    await userEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent('Leitura indisponível');
    await userEvent.click(toggle);
    await waitFor(() => expect(controller.readStudy).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('region', { name: 'Cenários de Estudo A' })).toBeInTheDocument();
  });

  it('resume combinação de carteiras sem montar 255 linhas e abre a recomendação diretamente', async () => {
    const base = await study('study-a', 'Estudo A');
    const scenarios = Array.from({ length: 255 }, (_, index) => ({
      ...base.scenarios[0]!, id: `scenario-${index}`, name: `Cenário ${index}`,
    }));
    const full = { ...base, studyType: 'PORTFOLIO_COMBINATIONS' as const,
      baseScenarioId: scenarios[0]!.id, scenarios };
    controller.listStudySummaries.mockResolvedValue([{ ...summarizeStudy(full, 0), scenarioCount: 255 }]);
    controller.readStudy.mockResolvedValue(full);
    render(<MemoryRouter><DiagnosticsHubPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: /Estudo A/ })).toHaveTextContent('255 cenários');
    expect(screen.queryByRole('button', { name: 'Mostrar diagnósticos de Estudo A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir recomendação' }))
      .toHaveAttribute('href', '/estudos/study-a/diagnostico');
    expect(controller.readStudy).not.toHaveBeenCalled();
  });
});
