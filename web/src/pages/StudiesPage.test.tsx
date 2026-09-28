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
import { buildStudyExport } from '../study/studyTransfer';

const controller = {
  listStudies: vi.fn<() => Promise<StudyDocument[]>>(),
  demoInstallationStatus: vi.fn<() => Promise<'INSTALLED' | 'REMOVED' | null>>(),
  restoreDemoStudy: vi.fn<() => Promise<StudyDocument | null>>(),
  saveDetachedStudy: vi.fn<(study: StudyDocument, expectedRevision: number) => Promise<StudyDocument>>(),
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
    controller.demoInstallationStatus.mockResolvedValue(null);
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
    controller.demoInstallationStatus.mockResolvedValue('INSTALLED');
    page();
    expect(await screen.findByRole('button', { name: 'Abrir Demonstração' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar estudo demonstrativo' })).not.toBeInTheDocument();
  });

  it('oferece restauração após remoção mesmo quando há outro Estudo', async () => {
    controller.listStudies.mockResolvedValue([await study()]);
    controller.demoInstallationStatus.mockResolvedValue('REMOVED');
    controller.restoreDemoStudy.mockResolvedValue(await study());
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar estudo demonstrativo' }));
    expect(controller.restoreDemoStudy).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Demonstração aberta' })).toBeInTheDocument();
  });
});

describe('StudiesPage cópia de segurança', () => {
  beforeEach(() => {
    controller.listStudies.mockResolvedValue([]);
    controller.demoInstallationStatus.mockResolvedValue('INSTALLED');
    controller.snapshot.error = null;
    controller.snapshot.status = 'IDLE';
    controller.saveDetachedStudy.mockReset();
    controller.saveDetachedStudy.mockImplementation(async (value) => value);
  });

  it('avisa que o estudo fica salvo só neste navegador', async () => {
    page();
    expect(await screen.findByText('Salvo neste navegador.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar estudo' })).toBeInTheDocument();
  });

  it('importa um arquivo exportado e grava o estudo como revisão 1', async () => {
    const exported = buildStudyExport({ ...(await study()), revision: 5 }, { now: FIXTURE_NOW, buildSha: null });
    page();
    await screen.findByText('Nenhum estudo salvo nesta conta.');
    const file = new File([JSON.stringify(exported)], 'estudo.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText('Arquivo do estudo para importar'), file);
    expect(await screen.findByText(/Estudo “Demonstração” importado/)).toBeInTheDocument();
    expect(controller.saveDetachedStudy).toHaveBeenCalledWith(expect.objectContaining({ id: 'demo', revision: 1 }), 0);
  });

  it('mostra erro claro para arquivo que não é estudo', async () => {
    page();
    await screen.findByText('Nenhum estudo salvo nesta conta.');
    await userEvent.upload(screen.getByLabelText('Arquivo do estudo para importar'), new File(['{"x":1}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não é um estudo exportado');
    expect(controller.saveDetachedStudy).not.toHaveBeenCalled();
  });
});
