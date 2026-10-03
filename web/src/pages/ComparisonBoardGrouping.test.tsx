// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { observedInput } from '../communication/testFixtures';
import { ComparisonBoardPage } from './ComparisonBoardPage';

const mocks = vi.hoisted(() => ({
  controller: { listStudies: vi.fn(), listObservedCases: vi.fn(), listCompanies: vi.fn() },
}));

vi.mock('../app/providers', () => ({ useStudyController: () => mocks.controller }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => null }));

async function twoStudies() {
  const { study } = await observedInput();
  return [{ ...study, name: 'Estudo Alfa' }, { ...study, id: '00000000-0000-4000-8000-0000000000b2', name: 'Estudo Beta' }];
}

describe('Comparar estudos', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.controller.listObservedCases.mockResolvedValue([]);
    mocks.controller.listCompanies.mockResolvedValue([]);
  });

  it('agrupa os cenários por estudo, recolhidos, com a contagem marcada', async () => {
    mocks.controller.listStudies.mockResolvedValue(await twoStudies());
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/quadro']}><ComparisonBoardPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Comparar estudos', level: 1 })).toBeInTheDocument();
    const alfa = await screen.findByRole('checkbox', { name: 'Todos os cenários de Estudo Alfa' });
    expect(screen.getByRole('checkbox', { name: 'Todos os cenários de Estudo Beta' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Estudo Alfa' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(alfa);
    expect(alfa).toBeChecked();
    const group = alfa.closest('li')!;
    expect(within(group as HTMLElement).getByText(/^1 de 1$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Estudo Beta' }));
    expect(screen.getByRole('button', { name: 'Estudo Beta' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('não oferece apagar estudo no quadro', async () => {
    mocks.controller.listStudies.mockResolvedValue(await twoStudies());
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/quadro']}><ComparisonBoardPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Marcar todos' }));
    expect(await screen.findAllByRole('button', { name: /^Remover / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Apagar/ })).not.toBeInTheDocument();
  });
});
