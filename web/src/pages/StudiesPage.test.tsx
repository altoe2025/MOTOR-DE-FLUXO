// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStudy } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { StudiesPage } from './StudiesPage';

const controller = {
  listStudies: vi.fn<() => Promise<StudyDocument[]>>(),
  restoreDemoStudy: vi.fn<() => Promise<StudyDocument | null>>(),
  subscribe: () => () => undefined,
  snapshot: { document: null, status: 'IDLE', error: null as unknown },
};
vi.mock('../app/providers', () => ({ useStudyController: () => controller, useApiClient: () => ({}) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ userId: FIXTURE_OWNER }) }));

function page() {
  return render(<MemoryRouter><Routes>
    <Route path="/" element={<StudiesPage />} />
    <Route path="/estudos/:id" element={<h1>Demonstração aberta</h1>} />
  </Routes></MemoryRouter>);
}

async function study() {
  return createStudy({ id: 'demo', ownerSub: FIXTURE_OWNER, name: 'Demonstração',
    baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
}

describe('StudiesPage demo recovery', () => {
  beforeEach(() => {
    controller.listStudies.mockResolvedValue([]);
    controller.snapshot.error = null;
    controller.snapshot.status = 'IDLE';
    controller.restoreDemoStudy.mockReset();
  });

  it('oferece restauração explícita na página vazia e abre o estudo persistido', async () => {
    controller.restoreDemoStudy.mockResolvedValue(await study());
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar estudo demonstrativo' }));
    expect(await screen.findByRole('heading', { name: 'Demonstração aberta' })).toBeInTheDocument();
  });

  it('mantém erro automático de armazenamento visível após carregar a lista vazia', async () => {
    controller.snapshot.error = new Error('Não há espaço para instalar a demonstração.');
    controller.snapshot.status = 'STORAGE_FAILURE';
    page();
    expect(await screen.findByText('Nenhum estudo salvo nesta conta.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Não há espaço');
    expect(screen.getByRole('button', { name: 'Carregar estudo demonstrativo' })).toBeEnabled();
  });

  it('mostra falha da restauração e permite tentar novamente', async () => {
    controller.restoreDemoStudy.mockRejectedValue(new Error('Falha ao persistir a demonstração.'));
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar estudo demonstrativo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao persistir');
    expect(screen.getByRole('button', { name: 'Carregar estudo demonstrativo' })).toBeEnabled();
  });

  it('não mostra recuperação de página vazia quando já existe um estudo', async () => {
    controller.listStudies.mockResolvedValue([await study()]);
    page();
    expect(await screen.findByRole('button', { name: 'Abrir Demonstração' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar estudo demonstrativo' })).not.toBeInTheDocument();
  });
});
