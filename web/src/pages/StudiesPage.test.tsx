// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStudy } from '../study/domain';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeObservedSnapshot, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { StudiesPage } from './StudiesPage';
import { buildStudyExport } from '../study/studyTransfer';

const api = { preparePortfolio: vi.fn() };
let subscriber: (() => void) | null = null;
const controller = {
  listStudies: vi.fn<() => Promise<StudyDocument[]>>(),
  demoInstallationStatus: vi.fn<() => Promise<'INSTALLED' | 'REMOVED' | null>>(),
  restoreDemoStudy: vi.fn<() => Promise<StudyDocument | null>>(),
  saveDetachedStudy: vi.fn<(study: StudyDocument, expectedRevision: number) => Promise<StudyDocument>>(),
  loadStudy: vi.fn<(id: string) => Promise<StudyDocument | null>>(),
  restoreStudy: vi.fn<(id: string, revision: number) => Promise<StudyDocument>>(),
  listObservedCases: vi.fn<() => Promise<ObservedCase[]>>(),
  listCompanies: vi.fn<() => Promise<CompanyRecord[]>>(),
  startNewStudy: vi.fn(),
  edit: vi.fn<(study: StudyDocument) => void>(),
  flush: vi.fn<() => Promise<StudyDocument | null>>(async () => null),
  subscribe: (listener: () => void) => { subscriber = listener; return () => { subscriber = null; }; },
  snapshot: { document: null, status: 'IDLE', error: null as unknown },
};
vi.mock('../app/providers', () => ({ useStudyController: () => controller, useApiClient: () => api }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ userId: FIXTURE_OWNER }) }));

vi.mock('../preparation/resolvePortfolioSource', async (importOriginal) => ({
  ...await importOriginal<typeof import('../preparation/resolvePortfolioSource')>(),
  resolvePortfolioSource: vi.fn(),
}));
afterEach(() => vi.unstubAllEnvs());

function page() {
  return render(<MemoryRouter><Routes>
    <Route path="/" element={<StudiesPage />} />
    <Route path="/estudos/:id" element={<h1>Demonstração aberta</h1>} />
    <Route path="/carteira/:id" element={<h1>Carteira aberta</h1>} />
  </Routes></MemoryRouter>);
}

async function study() {
  return createStudy({ id: 'demo', ownerSub: FIXTURE_OWNER, name: 'Demonstração',
    baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
}

describe('StudiesPage demo recovery', () => {
  it('cria e salva o tipo separado de combinação sem alterar a criação de estudos comuns', async () => {
    vi.stubEnv('VITE_MOTOR_BUILD_SHA', 'd'.repeat(40));
    vi.mocked(resolvePortfolioSource).mockResolvedValueOnce(makeScenarioDraft().sourceSnapshot);
    controller.flush.mockResolvedValue(null);
    controller.edit.mockClear();
    page();
    expect(screen.getByRole('button', { name: 'Novo estudo' }))
      .toHaveAttribute('data-chat-help-id', 'control.estudos.novo');
    expect(screen.getByRole('button', { name: 'Nova combinação de carteiras' }))
      .toHaveAttribute('data-chat-help-id', 'control.estudos.nova-combinacao');
    await userEvent.click(screen.getByRole('button', { name: 'Nova combinação de carteiras' }));
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
    expect(controller.edit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Combinação de carteiras', studyType: 'PORTFOLIO_COMBINATIONS',
    }));
    expect(controller.flush).toHaveBeenCalled();
  });
  beforeEach(() => {
    subscriber = null;
    controller.listStudies.mockResolvedValue([]);
    controller.demoInstallationStatus.mockResolvedValue(null);
    controller.snapshot.error = null;
    controller.snapshot.status = 'IDLE';
    controller.restoreDemoStudy.mockReset();
  });

  it('atualiza a lista uma vez após a sequência DIRTY, SAVING e SAVED', async () => {
    page();
    await screen.findByText('Nenhum estudo salvo nesta conta.');
    controller.listStudies.mockClear();

    controller.snapshot.status = 'DIRTY'; subscriber?.();
    controller.snapshot.status = 'SAVING'; subscriber?.();
    controller.snapshot.status = 'SAVED'; subscriber?.();

    await waitFor(() => expect(controller.listStudies).toHaveBeenCalledOnce());
  });

  it('faz uma leitura final quando SAVED chega durante uma leitura em andamento', async () => {
    const saved = await study();
    let finishFirstRead: ((value: StudyDocument[]) => void) | undefined;
    controller.listStudies
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirstRead = resolve; }))
      .mockResolvedValueOnce([saved]);
    page();
    await waitFor(() => expect(controller.listStudies).toHaveBeenCalledOnce());

    controller.snapshot.status = 'SAVED';
    subscriber?.();
    finishFirstRead?.([]);

    expect(await screen.findByRole('button', { name: 'Abrir Demonstração' })).toBeInTheDocument();
    expect(controller.listStudies).toHaveBeenCalledTimes(2);
  });

  it('não atualiza nem inicia a leitura pendente após desmontar', async () => {
    let finishFirstRead: ((value: StudyDocument[]) => void) | undefined;
    controller.listStudies.mockImplementationOnce(() => new Promise((resolve) => { finishFirstRead = resolve; }));
    const rendered = page();
    await waitFor(() => expect(controller.listStudies).toHaveBeenCalledOnce());
    controller.snapshot.status = 'SAVED';
    subscriber?.();

    rendered.unmount();
    finishFirstRead?.([]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(controller.listStudies).toHaveBeenCalledOnce();
  });

  it('impede duas criações concorrentes da combinação de carteiras', async () => {
    vi.stubEnv('VITE_MOTOR_BUILD_SHA', 'd'.repeat(40));
    let finishCreation: ((value: ReturnType<typeof makeScenarioDraft>['sourceSnapshot']) => void) | undefined;
    vi.mocked(resolvePortfolioSource).mockImplementationOnce(() => new Promise((resolve) => { finishCreation = resolve; }));
    page();
    const button = await screen.findByRole('button', { name: 'Nova combinação de carteiras' });

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(button).toBeDisabled();
    await waitFor(() => expect(resolvePortfolioSource).toHaveBeenCalledOnce());
    finishCreation?.(makeScenarioDraft().sourceSnapshot);
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
  });

  it('não repete a leitura quando o salvamento de uma edição publica SAVED', async () => {
    const existing = await study();
    controller.listStudies.mockResolvedValue([existing]);
    controller.loadStudy.mockImplementation(async () => {
      controller.snapshot.status = 'SAVED';
      subscriber?.();
      return existing;
    });
    controller.flush.mockImplementationOnce(async () => {
      controller.snapshot.status = 'SAVED';
      subscriber?.();
      return existing;
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Nome atualizado');
    page();
    await screen.findByRole('button', { name: 'Abrir Demonstração' });
    controller.listStudies.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Renomear Demonstração' }));

    await waitFor(() => expect(controller.listStudies).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(controller.listStudies).toHaveBeenCalledOnce();
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
    expect(screen.getByRole('button', { name: 'Importar estudo' }))
      .toHaveAttribute('data-chat-help-id', 'control.estudos.importar');
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

describe('StudiesPage novo estudo', () => {
  beforeEach(() => {
    controller.listStudies.mockResolvedValue([]);
    controller.demoInstallationStatus.mockResolvedValue('INSTALLED');
    controller.snapshot.error = null;
    controller.snapshot.status = 'IDLE';
    controller.edit.mockReset();
    controller.listCompanies.mockResolvedValue([{ id: 'company-1', displayName: 'AstroPay' } as CompanyRecord]);
  });

  it('pergunta a origem antes de criar e cria com o caso importado, sem gerar exemplo', async () => {
    vi.mocked(resolvePortfolioSource).mockResolvedValueOnce(makeObservedSnapshot(makeObservedCase()));
    controller.listObservedCases.mockResolvedValue([makeObservedCase()]);
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Novo estudo' }));
    expect(await screen.findByRole('heading', { name: 'Novo estudo: de onde vêm os dados?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dados importados de uma empresa' })).toBeChecked();
    expect(controller.edit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Criar estudo' }))
      .toHaveAttribute('data-chat-help-id', 'control.estudos.criar-caso');
    await userEvent.click(screen.getByRole('button', { name: 'Criar estudo' }));
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
    const created = controller.edit.mock.calls[0]![0];
    expect(created.scenarios[0]!.sourceSnapshot.source).toMatchObject({ kind: 'OBSERVED_CASE', caseId: 'case-1' });
    expect(created.name).toBe('AstroPay · set/2026');
  });

  it('sem casos importados, oferece importar e deixa a carteira gerada como escolha', async () => {
    controller.listObservedCases.mockResolvedValue([]);
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Novo estudo' }));
    expect(await screen.findByRole('radio', { name: 'Carteira gerada (exemplo)' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Dados importados de uma empresa' }));
    expect(screen.getByRole('link', { name: 'Importar planilha' })).toHaveAttribute('href', '/importar');
  });
});
