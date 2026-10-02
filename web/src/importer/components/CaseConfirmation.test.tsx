// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../../cases/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeObservedCase } from '../../study/fixtures';
import type { StudyDocument } from '../../study/model';
import { studyFromObservedCases } from '../../study/newStudy';
import { CaseConfirmation } from './CaseConfirmation';

const companies = [{ id: 'company-1', displayName: 'AstroPay' }, { id: 'company-y', displayName: 'Empresa Y' }] as CompanyRecord[];
const astro = makeObservedCase();
const empresaY: ObservedCase = { ...makeObservedCase(), id: 'case-y', companyId: 'company-y' };

const controller = {
  listCompanies: vi.fn(async () => companies),
  listObservedCases: vi.fn(async () => [astro, empresaY]),
  listStudies: vi.fn<() => Promise<StudyDocument[]>>(),
  loadStudy: vi.fn<(id: string) => Promise<StudyDocument | null>>(),
  startNewStudy: vi.fn(),
  edit: vi.fn<(study: StudyDocument) => void>(),
  flush: vi.fn<() => Promise<StudyDocument | null>>(),
};
vi.mock('../../app/providers', () => ({ useStudyController: () => controller }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ userId: FIXTURE_OWNER }) }));

function page(observedCase: ObservedCase) {
  return render(<MemoryRouter><Routes>
    <Route path="/" element={<CaseConfirmation observedCase={observedCase} />} />
    <Route path="/carteira/:id" element={<h1>Carteira aberta</h1>} />
  </Routes></MemoryRouter>);
}

let counter = 0;
const context = { ownerSub: FIXTURE_OWNER, now: FIXTURE_NOW, ids: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, companies };

describe('CaseConfirmation atalhos', () => {
  beforeEach(() => {
    controller.edit.mockReset();
    controller.flush.mockImplementation(async () => controller.edit.mock.calls.at(-1)?.[0] ?? null);
  });

  it('“Analisar este caso” cria o estudo com o caso como origem e abre a carteira', async () => {
    page(astro);
    expect(screen.getByRole('button', { name: 'Analisar este caso' }))
      .toHaveAttribute('data-chat-help-id', 'control.importacao.analisar-caso');
    await userEvent.click(screen.getByRole('button', { name: 'Analisar este caso' }));
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
    expect(controller.edit.mock.calls[0]![0].scenarios[0]!.sourceSnapshot.source).toMatchObject({ kind: 'OBSERVED_CASE', caseId: astro.id });
  });

  it('“Adicionar a uma carteira” junta o caso ao estudo escolhido', async () => {
    const existing = await studyFromObservedCases([astro], context);
    controller.listStudies.mockResolvedValue([existing]);
    controller.loadStudy.mockResolvedValue(existing);
    page(empresaY);
    expect(screen.getByRole('button', { name: 'Adicionar a uma carteira' }))
      .toHaveAttribute('data-chat-help-id', 'control.importacao.adicionar-carteira');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar a uma carteira' }));
    expect(await screen.findByRole('combobox', { name: 'Estudo que recebe o caso' })).toHaveValue(existing.id);
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar e abrir o estudo' }));
    expect(await screen.findByRole('heading', { name: 'Carteira aberta' })).toBeInTheDocument();
    const saved = controller.edit.mock.calls[0]![0];
    expect(saved.id).toBe(existing.id);
    expect(saved.name).toBe('AstroPay + Empresa Y · set/2026');
  });

  it('sem estudo com dados importados, explica o que fazer', async () => {
    controller.listStudies.mockResolvedValue([]);
    page(astro);
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar a uma carteira' }));
    expect(await screen.findByText(/Nenhum estudo com dados importados ainda/)).toBeInTheDocument();
  });
});
