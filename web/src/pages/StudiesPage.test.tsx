// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStudy } from '../study/domain';
import { StudyList } from '../study/components/StudyList';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase, makeObservedSnapshot, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { summarizeStudy, type StudySummary } from '../storage/applicationRepository';
import { StudiesPage } from './StudiesPage';
import { buildStudyExport } from '../study/studyTransfer';

const api = { preparePortfolio: vi.fn() };
let subscriber: (() => void) | null = null;
const controller = {
  listStudySummaries: vi.fn<() => Promise<StudySummary[]>>(),
  listStudies: vi.fn<() => Promise<StudyDocument[]>>(),
  demoInstallationStatus: vi.fn<() => Promise<'INSTALLED' | 'REMOVED' | null>>(),
  restoreDemoStudy: vi.fn<() => Promise<StudyDocument | null>>(),
  saveDetachedStudy: vi.fn<(study: StudyDocument, expectedRevision: number) => Promise<StudyDocument>>(),
  loadStudy: vi.fn<(id: string) => Promise<StudyDocument | null>>(),
  readStudy: vi.fn<(id: string) => Promise<StudyDocument | null>>(),
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
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => {
  controller.listStudies.mockReset(); controller.listStudySummaries.mockReset();
  controller.loadStudy.mockReset(); controller.readStudy.mockReset();
  api.preparePortfolio.mockReset();
});

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

describe('StudyList com resumos', () => {
  it('preserva origem, resultado e ações sem carregar cenários', async () => {
    const base = summarizeStudy(await study(), 0);
    const summaries: StudySummary[] = [
      { ...base, id: 'imported', name: 'Importado', baseSourceKind: 'OBSERVED_CASE' },
      { ...base, id: 'synthetic', name: 'Sintético', baseSourceKind: 'SYNTHETIC', hasExecutions: true, executionCount: 2 },
      { ...base, id: 'multi', name: 'Empresas', baseSourceKind: 'AUTHORED_MULTI_COMPANY' },
      { ...base, id: 'manual', name: 'Manual', baseSourceKind: 'AUTHORED' },
    ];
    const onDuplicate = vi.fn();
    render(<StudyList studies={summaries} selectedId={null} onCreate={vi.fn()} onOpen={vi.fn()}
      onRename={vi.fn()} onDuplicate={onDuplicate} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Abrir Importado' })).toHaveTextContent('Dados importados de uma empresa');
    expect(screen.getByRole('button', { name: 'Abrir Sintético' })).toHaveTextContent('Carteira gerada (exemplo)');
    expect(screen.getByRole('button', { name: 'Abrir Sintético' })).toHaveTextContent('Resultado disponível');
    expect(screen.getByRole('button', { name: 'Abrir Empresas' })).toHaveTextContent('Carteira de várias empresas');
    expect(screen.getByRole('button', { name: 'Abrir Manual' })).toHaveTextContent('Montada à mão');
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações: Importado' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar Importado' }));
    expect(onDuplicate).toHaveBeenCalledWith(summaries[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações: criar' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Lixeira de estudos' }));
    expect(screen.getByText('A lixeira está vazia.')).toBeInTheDocument();
  });
});

describe('StudiesPage demo recovery', () => {
  it('cria e salva o tipo separado de combinação sem alterar a criação de estudos comuns', async () => {
    vi.stubEnv('VITE_MOTOR_BUILD_SHA', 'd'.repeat(40));
    vi.mocked(resolvePortfolioSource).mockResolvedValueOnce(makeScenarioDraft().sourceSnapshot);
    controller.flush.mockResolvedValue(null);
    controller.edit.mockClear();
    page();
    expect(screen.getByRole('button', { name: 'Novo estudo' }))
      .toHaveAttribute('data-chat-help-id', 'control.estudos.novo');
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações: criar' }));
    expect(screen.getByRole('menuitem', { name: 'Nova combinação de carteiras' }))
      .toHaveAttribute('data-chat-help-id', 'control.estudos.nova-combinacao');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nova combinação de carteiras' }));
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
    expect(controller.edit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Combinação de carteiras', studyType: 'PORTFOLIO_COMBINATIONS',
    }));
    expect(controller.flush).toHaveBeenCalled();
  });
  beforeEach(() => {
    subscriber = null;
    controller.listStudySummaries.mockResolvedValue([]);
    controller.listStudies.mockResolvedValue([]);
    controller.demoInstallationStatus.mockResolvedValue(null);
    controller.snapshot.error = null;
    controller.snapshot.status = 'IDLE';
    controller.restoreDemoStudy.mockReset();
  });

  it('atualiza a lista uma vez após a sequência DIRTY, SAVING e SAVED', async () => {
    page();
    await screen.findByText('Nenhum estudo salvo nesta conta.');
    expect(controller.listStudies).not.toHaveBeenCalled();
    expect(api.preparePortfolio).not.toHaveBeenCalled();
    controller.listStudySummaries.mockClear();

    controller.snapshot.status = 'DIRTY'; subscriber?.();
    controller.snapshot.status = 'SAVING'; subscriber?.();
    controller.snapshot.status = 'SAVED'; subscriber?.();

    await waitFor(() => expect(controller.listStudySummaries).toHaveBeenCalledOnce());
  });

  it('faz uma leitura final quando SAVED chega durante uma leitura em andamento', async () => {
    const saved = await study();
    let finishFirstRead: ((value: StudySummary[]) => void) | undefined;
    controller.listStudySummaries
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirstRead = resolve; }))
      .mockResolvedValueOnce([summarizeStudy(saved, 0)]);
    page();
    await waitFor(() => expect(controller.listStudySummaries).toHaveBeenCalledOnce());

    controller.snapshot.status = 'SAVED';
    subscriber?.();
    finishFirstRead?.([]);

    expect(await screen.findByRole('button', { name: 'Abrir Demonstração' })).toBeInTheDocument();
    expect(controller.listStudySummaries).toHaveBeenCalledTimes(2);
  });

  it('não atualiza nem inicia a leitura pendente após desmontar', async () => {
    let finishFirstRead: ((value: StudySummary[]) => void) | undefined;
    controller.listStudySummaries.mockImplementationOnce(() => new Promise((resolve) => { finishFirstRead = resolve; }));
    const rendered = page();
    await waitFor(() => expect(controller.listStudySummaries).toHaveBeenCalledOnce());
    controller.snapshot.status = 'SAVED';
    subscriber?.();

    rendered.unmount();
    finishFirstRead?.([]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(controller.listStudySummaries).toHaveBeenCalledOnce();
  });

  it('impede duas criações concorrentes da combinação de carteiras', async () => {
    vi.stubEnv('VITE_MOTOR_BUILD_SHA', 'd'.repeat(40));
    let finishCreation: ((value: ReturnType<typeof makeScenarioDraft>['sourceSnapshot']) => void) | undefined;
    vi.mocked(resolvePortfolioSource).mockImplementationOnce(() => new Promise((resolve) => { finishCreation = resolve; }));
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais ações: criar' }));
    const item = screen.getByRole('menuitem', { name: 'Nova combinação de carteiras' });

    act(() => { item.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações: criar' }));
    expect(screen.getByRole('menuitem', { name: 'Nova combinação de carteiras' })).toBeDisabled();
    await waitFor(() => expect(resolvePortfolioSource).toHaveBeenCalledOnce());
    finishCreation?.(makeScenarioDraft().sourceSnapshot);
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
  });

  it('mantém feedback visual enquanto cria uma combinação de carteiras', async () => {
    vi.stubEnv('VITE_MOTOR_BUILD_SHA', 'd'.repeat(40));
    let finishCreation: ((value: ReturnType<typeof makeScenarioDraft>['sourceSnapshot']) => void) | undefined;
    vi.mocked(resolvePortfolioSource).mockImplementationOnce(() => new Promise((resolve) => { finishCreation = resolve; }));
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais ações: criar' }));

    await userEvent.click(screen.getByRole('menuitem', { name: 'Nova combinação de carteiras' }));

    expect(screen.getByRole('status')).toHaveTextContent('Criando combinação de carteiras');
    finishCreation?.(makeScenarioDraft().sourceSnapshot);
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
  });

  it('não repete a leitura quando o salvamento de uma edição publica SAVED', async () => {
    const existing = await study();
    controller.listStudySummaries.mockResolvedValue([summarizeStudy(existing, 0)]);
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
    controller.listStudySummaries.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Mais ações: Demonstração' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Renomear Demonstração' }));

    await waitFor(() => expect(controller.listStudySummaries).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(controller.listStudySummaries).toHaveBeenCalledOnce();
  });

  it('lê somente o documento escolhido ao duplicar e não substitui a seleção atual', async () => {
    const existing = await study();
    controller.listStudySummaries.mockResolvedValue([summarizeStudy(existing, 0)]);
    controller.readStudy.mockResolvedValue(existing);
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais ações: Demonstração' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar Demonstração' }));
    await waitFor(() => expect(controller.edit).toHaveBeenCalled());
    expect(controller.readStudy).toHaveBeenCalledExactlyOnceWith('demo');
    expect(controller.loadStudy).not.toHaveBeenCalled();
    expect(controller.listStudies).not.toHaveBeenCalled();
  });

  it('exporta apenas o estudo escolhido por leitura destacada', async () => {
    const existing = await study();
    controller.listStudySummaries.mockResolvedValue([summarizeStudy(existing, 0)]);
    controller.readStudy.mockResolvedValue(existing);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:study'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      page();
      await userEvent.click(await screen.findByRole('button', { name: 'Mais ações: Demonstração' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Exportar Demonstração' }));
      await waitFor(() => expect(controller.readStudy).toHaveBeenCalledExactlyOnceWith('demo'));
      expect(controller.loadStudy).not.toHaveBeenCalled();
      expect(controller.listStudies).not.toHaveBeenCalled();
      expect(click).toHaveBeenCalledOnce();
    } finally { click.mockRestore(); }
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
    controller.listStudySummaries.mockResolvedValue([summarizeStudy(await study(), 0)]);
    controller.demoInstallationStatus.mockResolvedValue('INSTALLED');
    page();
    expect(await screen.findByRole('button', { name: 'Abrir Demonstração' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar estudo demonstrativo' })).not.toBeInTheDocument();
  });

  it('oferece restauração após remoção mesmo quando há outro Estudo', async () => {
    controller.listStudySummaries.mockResolvedValue([summarizeStudy(await study(), 0)]);
    controller.demoInstallationStatus.mockResolvedValue('REMOVED');
    controller.restoreDemoStudy.mockResolvedValue(await study());
    page();
    // Com estudos na lista, a demonstração sai do caminho e fica no menu de criação.
    await screen.findByRole('button', { name: 'Abrir Demonstração' });
    expect(screen.queryByRole('button', { name: 'Carregar estudo demonstrativo' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações: criar' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Carregar estudo demonstrativo' }));
    expect(controller.restoreDemoStudy).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Demonstração aberta' })).toBeInTheDocument();
  });
});

describe('StudiesPage carteira sintética local', () => {
  beforeEach(() => {
    controller.listStudySummaries.mockResolvedValue([]);
    controller.demoInstallationStatus.mockResolvedValue('INSTALLED');
    controller.snapshot.error = null;
    controller.snapshot.status = 'IDLE';
    controller.edit.mockClear();
    controller.flush.mockClear();
  });

  it('oculta o carregamento quando o bridge E2E não existe', async () => {
    page();
    await screen.findByText('Nenhum estudo salvo nesta conta.');
    expect(screen.queryByRole('button', { name: 'Carregar empresas sintéticas para análise de carteiras' })).not.toBeInTheDocument();
  });

  it('carrega uma vez, bloqueia cliques concorrentes e orienta a abrir a combinação', async () => {
    let finish!: (value: { companyIds: string[]; companyNames: string[] }) => void;
    const seedPortfolioShowcase = vi.fn(() => new Promise<{ companyIds: string[]; companyNames: string[] }>((resolve) => { finish = resolve; }));
    vi.stubGlobal('__MOTOR_E2E__', { seedPortfolioShowcase });
    page();
    const button = await screen.findByRole('button', { name: 'Carregar empresas sintéticas para análise de carteiras' });
    expect(button).toHaveAttribute('data-local-preview-only', 'true');
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(seedPortfolioShowcase).toHaveBeenCalledOnce();
    finish({ companyIds: ['a', 'b', 'c', 'd', 'e', 'f'], companyNames: ['A', 'B', 'C', 'D', 'E', 'F'] });
    expect(await screen.findByRole('status')).toHaveTextContent('6 empresas sintéticas');
    expect(screen.getByRole('status')).toHaveTextContent('Nova combinação de carteiras');
    expect(button).toBeEnabled();
    expect(controller.edit).not.toHaveBeenCalled();
    expect(controller.flush).not.toHaveBeenCalled();
  });

  it('expõe falha do seed como aviso acessível e libera nova tentativa', async () => {
    const seedPortfolioShowcase = vi.fn().mockRejectedValue(new Error('IndexedDB indisponível'));
    vi.stubGlobal('__MOTOR_E2E__', { seedPortfolioShowcase });
    page();
    const button = await screen.findByRole('button', { name: 'Carregar empresas sintéticas para análise de carteiras' });
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('IndexedDB indisponível');
    expect(button).toBeEnabled();
  });
});

describe('StudiesPage cópia de segurança', () => {
  beforeEach(() => {
    controller.listStudySummaries.mockResolvedValue([]);
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
    await userEvent.click(screen.getByRole('button', { name: 'Mais ações: criar' }));
    expect(screen.getByRole('menuitem', { name: 'Importar estudo' }))
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
    controller.listStudySummaries.mockResolvedValue([]);
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
