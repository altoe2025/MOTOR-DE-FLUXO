// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendScenario, createStudy } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { StudyPortfolioPage } from './StudyPortfolioPage';

const mocks = vi.hoisted(() => ({
  controller: {
    snapshot: { document: null as StudyDocument | null, status: 'READY' },
    loadStudy: vi.fn(),
    listObservedCases: vi.fn(async () => []),
    listCompanies: vi.fn(async () => []),
    subscribe: vi.fn(() => () => {}),
    edit: vi.fn(),
    flush: vi.fn(),
  },
}));

vi.mock('../app/providers', () => ({ useStudyController: () => mocks.controller, useApiClient: () => ({}) }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => null }));

async function studyWithVariation(): Promise<StudyDocument> {
  const study = await createStudy({ id: crypto.randomUUID(), ownerSub: FIXTURE_OWNER, name: 'Carteira teste',
    baseScenario: makeScenarioDraft({ id: crypto.randomUUID(), name: 'Original' }), now: FIXTURE_NOW });
  return appendScenario(study, makeScenarioDraft({ id: crypto.randomUUID(), name: 'Volume OUT ×2' }), FIXTURE_NOW);
}

async function open(study: StudyDocument) {
  mocks.controller.loadStudy.mockImplementation(async () => { mocks.controller.snapshot.document = study; return study; });
  mocks.controller.flush.mockImplementation(async () => mocks.controller.snapshot.document);
  mocks.controller.edit.mockImplementation((next: StudyDocument) => { mocks.controller.snapshot.document = next; });
  const router = createMemoryRouter([{ path: '/carteira/:id', element: <StudyPortfolioPage /> }], { initialEntries: [`/carteira/${study.id}`] });
  render(<RouterProvider router={router} />);
  return screen.findByRole('region', { name: 'Cenários do estudo' });
}

beforeEach(() => { vi.clearAllMocks(); mocks.controller.snapshot.document = null; });
afterEach(cleanup);

describe('StudyPortfolioPage · cenários', () => {
  it('lista cada cenário com estado, diagnóstico à vista e as outras ações no ⋯', async () => {
    const list = await open(await studyWithVariation());
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Original');
    expect(items[0]).toHaveTextContent('sem diagnóstico');
    expect(within(items[0]!).getByRole('button', { name: 'Executar diagnóstico' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Renomear cenário/ })).not.toBeInTheDocument();
    expect(list).toHaveTextContent('base: Original');
  });

  it('o original não pode ser apagado; a variação vira base pelo ⋯', async () => {
    const user = userEvent.setup();
    const list = await open(await studyWithVariation());
    await user.click(within(list).getByRole('button', { name: 'Mais ações: Original' }));
    expect(screen.getByRole('menuitem', { name: 'Renomear cenário Original' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Apagar/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(within(list).getByRole('button', { name: 'Mais ações: Volume OUT ×2' }));
    expect(screen.getByRole('menuitem', { name: 'Apagar cenário Volume OUT ×2' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Usar como base' }));
    expect(list).toHaveTextContent('base: Volume OUT ×2');
  });

  it('renomeia pelo ⋯', async () => {
    const user = userEvent.setup();
    const list = await open(await studyWithVariation());
    await user.click(within(list).getByRole('button', { name: 'Mais ações: Volume OUT ×2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renomear cenário Volume OUT ×2' }));
    const field = screen.getByLabelText('Novo nome');
    await user.clear(field);
    await user.type(field, 'Dobro do OUT{Enter}');
    expect(await within(list).findByText('Dobro do OUT')).toBeInTheDocument();
  });

  it('as alavancas vêm antes da lista de cenários', async () => {
    const list = await open(await studyWithVariation());
    const levers = screen.getByRole('region', { name: 'Alavancas' });
    expect(levers.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/^Passo \d/)).not.toBeInTheDocument();
  });
});
