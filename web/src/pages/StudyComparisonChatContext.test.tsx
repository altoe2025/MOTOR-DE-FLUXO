// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { comparisonInput } from '../communication/testFixtures';
import { StudyComparisonPage } from './StudyComparisonPage';

const mocks = vi.hoisted(() => {
  const loadStudy = vi.fn();
  return { loadStudy, controller: { loadStudy }, publishCommunication: vi.fn(),
    setScenarioId: vi.fn(), setDiagnosticExecutionId: vi.fn(), askAbout: vi.fn() };
});
vi.mock('../app/providers', () => ({ useStudyController: () => mocks.controller }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => ({
  publishCommunication: mocks.publishCommunication, setScenarioId: mocks.setScenarioId,
  setDiagnosticExecutionId: mocks.setDiagnosticExecutionId, askAbout: mocks.askAbout,
  routeContext: { routeId: 'comparison' },
}) }));

describe('comparison communication context', () => {
  it('restores the cited pair when navigating again to the same URL after changing the local selection', async () => {
    const input = await comparisonInput();
    mocks.loadStudy.mockResolvedValue(input.study);
    const url = `/comparar?studyId=${input.study.id}&baseExecutionId=${input.diagnosticExecutionId}&hypothesisExecutionId=${input.comparisonExecutionId}`;
    const router = createMemoryRouter([{ path: '/comparar', element: <StudyComparisonPage /> }], { initialEntries: [url] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByLabelText('Execução da hipótese')).toHaveValue(input.comparisonExecutionId));
    fireEvent.change(screen.getByLabelText('Execução da hipótese'), { target: { value: '' } });
    await act(async () => { await router.navigate(url); });
    await waitFor(() => expect(screen.getByLabelText('Execução da hipótese')).toHaveValue(input.comparisonExecutionId));
  });
  it('publishes the selected comparison only after explicit calculation', async () => {
    const user = userEvent.setup();
    const input = await comparisonInput();
    mocks.loadStudy.mockResolvedValue(input.study);
    render(<MemoryRouter initialEntries={[`/comparar?studyId=${input.study.id}`]}><StudyComparisonPage /></MemoryRouter>);
    expect(mocks.publishCommunication).not.toHaveBeenCalledWith(expect.objectContaining({ comparisonExecutionId: input.comparisonExecutionId }));
    const base = input.study.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.scenarioId === input.study.baseScenarioId && item.status === 'SUCCEEDED')!;
    await user.selectOptions(await screen.findByLabelText('Execução base'), base.id);
    await user.selectOptions(screen.getByLabelText('Execução da hipótese'), input.comparisonExecutionId!);
    await user.click(screen.getByRole('button', { name: 'Comparar' }));
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({
      study: expect.objectContaining({ id: input.study.id }), comparisonExecutionId: base.id,
      diagnosticExecutionId: input.comparisonExecutionId,
    })));
  });

  it('opens the comparison question with a comparison intent', async () => {
    const user = userEvent.setup();
    const input = await comparisonInput();
    mocks.loadStudy.mockResolvedValue(input.study);
    render(<MemoryRouter initialEntries={[`/comparar?studyId=${input.study.id}`]}><StudyComparisonPage /></MemoryRouter>);
    await user.selectOptions(await screen.findByLabelText('Execução base'), input.diagnosticExecutionId);
    await user.selectOptions(screen.getByLabelText('Execução da hipótese'), input.comparisonExecutionId!);
    await user.click(screen.getByRole('button', { name: 'Comparar' }));
    await user.click(screen.getAllByRole('button', { name: 'Perguntar sobre isto' })[0]!);
    expect(mocks.askAbout).toHaveBeenLastCalledWith(expect.any(String), undefined, 'COMPARISON');
  });

  it('reconstructs the cited base and hypothesis from validated URL selections', async () => {
    const input = await comparisonInput();
    mocks.loadStudy.mockResolvedValue(input.study);
    render(<MemoryRouter initialEntries={[`/comparar?studyId=${input.study.id}&baseExecutionId=${input.diagnosticExecutionId}&hypothesisExecutionId=${input.comparisonExecutionId}`]}>
      <StudyComparisonPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Execução base')).toHaveValue(input.diagnosticExecutionId));
    expect(screen.getByLabelText('Execução da hipótese')).toHaveValue(input.comparisonExecutionId);
    await waitFor(() => expect(mocks.publishCommunication).toHaveBeenCalledWith(expect.objectContaining({
      comparisonExecutionId: input.diagnosticExecutionId, diagnosticExecutionId: input.comparisonExecutionId,
    })));
  });
});
